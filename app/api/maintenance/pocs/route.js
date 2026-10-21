import { createClient } from '@supabase/supabase-js';

export async function GET(req) {
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const speciality = url.searchParams.get('speciality') || '';
  const contact = url.searchParams.get('contact') || '';
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  let query = supabase.from('maintenance_pocs').select('*').order('name');
  if (speciality) query = query.eq('speciality', speciality);
  if (search) query = query.or(`name.ilike.%${search}%,contact_primary.ilike.%${search}%,contact_alternate.ilike.%${search}%`);
  if (contact) query = query.eq('contact_primary', contact);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ pocs: data || [] });
}

export async function POST(req) {
  const { name, speciality, contact_primary, contact_alternate, reference, notes, star_rating, attachment_url } = await req.json();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // Duplicate guard: the same contact number must not exist twice in the directory.
  if (contact_primary) {
    const normalized = String(contact_primary).replace(/[\s\-()]/g, '');
    const { data: existing } = await supabase.from('maintenance_pocs').select('*');
    const match = (existing || []).find(p => {
      const c = String(p.contact_primary || '').replace(/[\s\-()]/g, '');
      const a = String(p.contact_alternate || '').replace(/[\s\-()]/g, '');
      return (c && c === normalized) || (a && a === normalized);
    });
    if (match) {
      return Response.json({ error: 'duplicate_contact', existing_poc: match }, { status: 409 });
    }
  }

  const { data, error } = await supabase.from('maintenance_pocs').insert({
    name, speciality, contact_primary, contact_alternate, reference, notes, star_rating, attachment_url
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ poc: data }, { status: 201 });
}
