import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const OPEN_JOB_STATUSES = ['pending_approval', 'Approved', 'Assigned', 'Awaiting POC', 'In Repair', 'Awaiting Quote'];

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const assetNumber = searchParams.get('asset_number');

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const { data: assets, error } = await supabase.from('assets').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Any open maintenance job (not Completed / Rejected) puts the asset into Maintenance
  const { data: jobs, error: jobsErr } = await supabase.from('maintenance_jobs').select('id, asset_serial, status');
  if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 });

  const openJobsByAsset = new Map();
  for (const job of jobs || []) {
    if (OPEN_JOB_STATUSES.includes(job.status)) {
      if (!openJobsByAsset.has(job.asset_serial)) openJobsByAsset.set(job.asset_serial, []);
      openJobsByAsset.get(job.asset_serial).push(job);
    }
  }

  const withStatus = (assets || []).map(a => {
    const open = openJobsByAsset.get(a.asset_number) || [];
    // Derived status: an open maintenance job means Maintenance, otherwise the stored status.
    // A stale stored 'Maintenance' with no open job falls back to Available.
    let status = a.status || 'Available';
    if (open.length > 0) status = 'Maintenance';
    else if (status === 'Maintenance') status = 'Available';
    return { ...a, status, open_maintenance_jobs: open.map(j => ({ id: j.id, status: j.status })) };
  });

  if (assetNumber) {
    const asset = withStatus.find(a => a.asset_number === assetNumber);
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    return NextResponse.json({ asset });
  }

  return NextResponse.json({ assets: withStatus });
}
