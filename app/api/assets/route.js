/**
 * app/api/assets/route.js — the asset register's one way in.
 *
 * The register is read and written through here, and the route uses the
 * signed-in person's own token rather than the service key, so the row-level
 * security on the tables does the deciding:
 *
 *   reading     anyone signed in
 *   writing     an administrator, or someone holding `manage_settings`
 *
 * A chiller is logged by whoever runs the place; a passer-by cannot add one.
 *
 * What it answers
 *   GET    ?asset_number=KICH00001   one asset, its jobs and its history
 *   GET                              every asset, with the lists to file them
 *   POST                             add one asset, or a stack of them
 *   PATCH                            change an asset, and write what changed
 *   DELETE ?asset_number=...         take an asset off the register
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { assetNumbers, warrantyTill } from '../../../lib/assets.js';

/** A job that is still open means the thing is in Maintenance. */
const OPEN_JOB_STATUSES = [
  'pending_approval', 'Approved', 'Assigned', 'Awaiting POC',
  'In Repair', 'Awaiting Quote',
];

/** The fields a person may change on an asset. */
const EDITABLE = [
  'name', 'category_id', 'type_id', 'location_id', 'condition', 'status',
  'brand', 'model_name', 'serial_number', 'purchase_date', 'purchase_price',
  'warranty_months', 'warranty_till', 'extended_warranty',
  'extended_warranty_months', 'warranty_contact', 'vendor_id',
  'assigned_employee_id', 'notes', 'is_new', 'last_maintenance_date',
];

/** How a field is read when it is written into the change history. */
const FIELD_LABELS = {
  name: 'Asset name',
  category_id: 'Category',
  type_id: 'Type',
  location_id: 'Location',
  condition: 'Condition',
  status: 'Status',
  brand: 'Brand',
  model_name: 'Model',
  serial_number: 'Serial number',
  purchase_date: 'Purchase date',
  purchase_price: 'Buying price',
  warranty_months: 'Warranty period',
  warranty_till: 'Warranty available till',
  extended_warranty: 'Extended warranty',
  extended_warranty_months: 'Extended warranty period',
  warranty_contact: 'Warranty contact',
  vendor_id: 'Vendor',
  assigned_employee_id: 'Assigned to',
  notes: 'Notes',
  is_new: 'New or used',
  last_maintenance_date: 'Last serviced on',
};

/** A client that acts as the signed-in person, so the database's own rules apply. */
function clientFor(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { token: null, supabase: null };
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    },
  );
  return { token, supabase };
}

/** The word a person sees when the write was refused because of who they are. */
function writeRefused(error) {
  const message = error?.message || '';
  if (/row-level security|permission denied|not authorized/i.test(message)) {
    return 'Only an administrator, or someone with the settings permission, can change the asset register.';
  }
  return message;
}

/**
 * Who is doing this.
 *
 * The change history says a name, not a session — so the person is looked up
 * from the token that made the request, not from whoever happens to be first
 * in the list.
 */
async function currentActor(supabase, token) {
  try {
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) return 'Someone';
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, email')
      .eq('id', user.id)
      .maybeSingle();
    return profile?.display_name || profile?.email || user.email || 'Someone';
  } catch {
    return 'Someone';
  }
}

/**
 * Read the register.
 */
export async function GET(req) {
  const { token, supabase } = clientFor(req);
  if (!token) {
    return NextResponse.json({ error: 'Sign in to read the asset register.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const assetNumber = searchParams.get('asset_number');

  const [assetsRes, categoriesRes, typesRes, locationsRes, jobsRes, employeesRes, vendorsRes] = await Promise.all([
    supabase.from('assets').select('*').order('asset_number'),
    supabase.from('asset_categories').select('*').order('name'),
    supabase.from('asset_types').select('*').order('name'),
    supabase.from('asset_locations').select('*').order('name'),
    supabase.from('maintenance_jobs').select('id, asset_serial, status, priority, service_type, requested_at, requested_by, completion_type'),
    supabase.from('employees').select('employee_id, name, designation').eq('status', 'active').order('name'),
    supabase.from('vendors').select('id, name').order('name'),
  ]);

  const error = assetsRes.error || categoriesRes.error || typesRes.error
    || locationsRes.error || jobsRes.error || employeesRes.error || vendorsRes.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const categories = categoriesRes.data || [];
  const types = typesRes.data || [];
  const locations = locationsRes.data || [];

  const categoryById = new Map(categories.map(c => [c.id, c]));
  const typeById = new Map(types.map(t => [t.id, t]));
  const locationById = new Map(locations.map(l => [l.id, l]));

  // The open work on each asset, and when it was last seen.
  const jobsByAsset = new Map();
  for (const job of jobsRes.data || []) {
    const key = job.asset_serial;
    if (!jobsByAsset.has(key)) jobsByAsset.set(key, []);
    jobsByAsset.get(key).push(job);
  }

  const openJobsFor = (number) => (jobsByAsset.get(number) || [])
    .filter(job => OPEN_JOB_STATUSES.includes(job.status))
    .map(job => ({ id: job.id, status: job.status, priority: job.priority, service_type: job.service_type }));

  const lastServicedFor = (number) => {
    const done = (jobsByAsset.get(number) || [])
      .filter(job => job.status === 'Completed')
      .map(job => job.requested_at)
      .filter(Boolean)
      .sort();
    return done.length ? done[done.length - 1].slice(0, 10) : null;
  };

  const assets = (assetsRes.data || []).map(asset => {
    const category = categoryById.get(asset.category_id);
    const type = typeById.get(asset.type_id);
    const location = locationById.get(asset.location_id);
    const open = openJobsFor(asset.asset_number);

    // The status a thing really is: an open job means it is in Maintenance,
    // whatever the stored status says. A stored Maintenance with no open job
    // falls back to what it was before, so a finished repair does not leave
    // the thing stuck.
    let status = asset.status || 'Available';
    if (open.length > 0) status = 'Maintenance';
    else if (status === 'Maintenance') status = asset.pre_maintenance_status || 'Available';

    return {
      ...asset,
      status,
      category_name: category?.name || null,
      category_prefix: category?.prefix || null,
      type_name: type?.name || asset.name || null,
      type_prefix: type?.prefix || null,
      location_name: location?.name || asset.location || null,
      open_maintenance_jobs: open,
      last_serviced_on: asset.last_maintenance_date || lastServicedFor(asset.asset_number),
    };
  });

  if (assetNumber) {
    const asset = assets.find(a => a.asset_number === assetNumber || a.id === assetNumber);
    if (!asset) {
      return NextResponse.json({ error: 'That asset is not on the register.' }, { status: 404 });
    }
    const [jobsRes2, auditRes] = await Promise.all([
      supabase.from('maintenance_jobs').select('*').eq('asset_serial', asset.asset_number).order('requested_at', { ascending: false }),
      supabase.from('asset_audit_log').select('*').eq('asset_id', asset.asset_number).order('created_at', { ascending: false }),
    ]);
    return NextResponse.json({
      asset,
      jobs: jobsRes2.data || [],
      history: auditRes.data || [],
      categories,
      types,
      locations,
      employees: employeesRes.data || [],
      vendors: vendorsRes.data || [],
    });
  }

  return NextResponse.json({
    assets,
    categories,
    types,
    locations,
    employees: employeesRes.data || [],
    vendors: vendorsRes.data || [],
  });
}

/**
 * Add one asset, or a stack of them.
 *
 * The numbers are made here: the category's prefix and the type's prefix,
 * then five digits. A quantity of twelve tables becomes twelve numbered
 * assets, not one row saying twelve.
 */
export async function POST(req) {
  const { token, supabase } = clientFor(req);
  if (!token) {
    return NextResponse.json({ error: 'Sign in to add to the asset register.' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'The request could not be read.' }, { status: 400 });
  }

  const incoming = Array.isArray(body?.assets) ? body.assets : body ? [body] : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'There was nothing to add.' }, { status: 400 });
  }
  if (incoming.length > 200) {
    return NextResponse.json({ error: 'That is too many at once — add up to 200 at a time.' }, { status: 400 });
  }

  const [{ data: categories }, { data: types }, { data: existing }] = await Promise.all([
    supabase.from('asset_categories').select('*'),
    supabase.from('asset_types').select('*'),
    supabase.from('assets').select('asset_number'),
  ]);
  if (!categories || !types) {
    return NextResponse.json({ error: 'The asset lists could not be read.' }, { status: 500 });
  }

  const categoryById = new Map(categories.map(c => [c.id, c]));
  const typeById = new Map(types.map(t => [t.id, t]));
  const takenNumbers = (existing || []).map(a => a.asset_number).filter(Boolean);

  // Work out every number first, so a stack of twelve does not collide with
  // itself on the way in.
  const planned = [];
  const working = [...takenNumbers];
  for (const entry of incoming) {
    const category = categoryById.get(Number(entry.category_id));
    const type = typeById.get(Number(entry.type_id));
    const quantity = Math.max(1, Number(entry.quantity) || 1);
    const numbers = entry.asset_number
      ? [entry.asset_number]
      : assetNumbers(category?.prefix || 'XX', type?.prefix || 'YY', quantity, working);

    for (const number of numbers) {
      working.push(number);
      planned.push({
        id: number,
        asset_number: number,
        serial_number: entry.serial_number || number,
        name: entry.name || type?.name || 'Asset',
        category_id: entry.category_id ? Number(entry.category_id) : null,
        type_id: entry.type_id ? Number(entry.type_id) : null,
        location_id: entry.location_id ? Number(entry.location_id) : null,
        condition: entry.condition || 'Brand New',
        status: entry.status || 'Available',
        brand: entry.brand || null,
        model_name: entry.model_name || null,
        purchase_date: entry.purchase_date || null,
        purchase_price: entry.purchase_price ?? null,
        warranty_months: entry.warranty_months ?? 0,
        warranty_till: entry.warranty_till || warrantyTill(entry.purchase_date, entry.warranty_months),
        extended_warranty: !!entry.extended_warranty,
        extended_warranty_months: entry.extended_warranty_months ?? 0,
        warranty_contact: entry.warranty_contact || null,
        vendor_id: entry.vendor_id ? Number(entry.vendor_id) : null,
        assigned_employee_id: entry.assigned_employee_id || null,
        notes: entry.notes || null,
        is_new: entry.is_new === undefined ? true : !!entry.is_new,
        created_at: new Date().toISOString(),
      });
    }
  }

  const { data: inserted, error: insErr } = await supabase.from('assets').insert(planned).select();
  if (insErr) {
    return NextResponse.json({ error: writeRefused(insErr) }, { status: 403 });
  }

  // The change history: what was added, by whom.
  const performedBy = await currentActor(supabase, token);

  const historyRows = (inserted || []).map(asset => ({
    asset_id: asset.asset_number,
    action: 'created',
    previous_value: null,
    new_value: asset.name,
    notes: 'Added to the register',
    performed_by: performedBy,
    created_at: new Date().toISOString(),
  }));
  if (historyRows.length) {
    await supabase.from('asset_audit_log').insert(historyRows);
  }

  return NextResponse.json({ assets: inserted || [], created: (inserted || []).length }, { status: 201 });
}

/**
 * Change an asset.
 *
 * Every field that actually changed is written into the asset's history, so
 * the record says who moved what, and when.
 */
export async function PATCH(req) {
  const { token, supabase } = clientFor(req);
  if (!token) {
    return NextResponse.json({ error: 'Sign in to change the asset register.' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'The request could not be read.' }, { status: 400 });
  }

  const assetNumber = body?.asset_number;
  if (!assetNumber) {
    return NextResponse.json({ error: 'Which asset? No asset number was given.' }, { status: 400 });
  }

  const { data: current, error: readErr } = await supabase
    .from('assets').select('*').eq('asset_number', assetNumber).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!current) {
    return NextResponse.json({ error: 'That asset is not on the register.' }, { status: 404 });
  }

  const changes = {};
  for (const field of EDITABLE) {
    if (body[field] === undefined) continue;
    const before = current[field] ?? null;
    const after = body[field] === '' ? null : body[field];
    if (String(before ?? '') !== String(after ?? '')) changes[field] = after;
  }
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ asset: current, changed: [] });
  }

  // A status that says Maintenance with no job behind it would sit there
  // forever, so the status before it is kept — that is what puts the asset
  // back where it was when the repair is finished.
  if (changes.status && changes.status !== 'Maintenance') {
    changes.pre_maintenance_status = current.status === 'Maintenance' ? current.pre_maintenance_status : current.status;
  }

  changes.updated_at = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from('assets').update(changes).eq('asset_number', assetNumber).select().single();
  if (updErr) {
    return NextResponse.json({ error: writeRefused(updErr) }, { status: 403 });
  }

  const performedBy = await currentActor(supabase, token);

  const historyRows = Object.keys(changes)
    .filter(field => field !== 'updated_at' && field !== 'pre_maintenance_status')
    .map(field => ({
      asset_id: assetNumber,
      action: 'updated',
      previous_value: current[field] === null || current[field] === undefined ? null : String(current[field]),
      new_value: changes[field] === null ? null : String(changes[field]),
      notes: body.note || FIELD_LABELS[field] || field,
      performed_by: performedBy,
      created_at: new Date().toISOString(),
    }));
  if (historyRows.length) {
    await supabase.from('asset_audit_log').insert(historyRows);
  }

  return NextResponse.json({ asset: updated, changed: Object.keys(changes) });
}

/**
 * Take an asset off the register.
 *
 * The history stays. A record of what happened to a thing that is no longer
 * here is still a record.
 */
export async function DELETE(req) {
  const { token, supabase } = clientFor(req);
  if (!token) {
    return NextResponse.json({ error: 'Sign in to change the asset register.' }, { status: 401 });
  }

  const assetNumber = new URL(req.url).searchParams.get('asset_number');
  if (!assetNumber) {
    return NextResponse.json({ error: 'Which asset? No asset number was given.' }, { status: 400 });
  }

  const { error } = await supabase.from('assets').delete().eq('asset_number', assetNumber);
  if (error) {
    return NextResponse.json({ error: writeRefused(error) }, { status: 403 });
  }
  return NextResponse.json({ removed: assetNumber });
}
