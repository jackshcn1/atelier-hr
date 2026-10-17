import { createClient } from '../../../../lib/supabaseClient';

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase.from('maintenance_pocs').select('*').order('name');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ pocs: data || [] });
}

export async function POST(req) {
  const { name, speciality, contact_primary, contact_alternate, reference, notes, star_rating, attachment_url } = await req.json();
  const supabase = createClient();
  const { data, error } = await supabase.from('maintenance_pocs').insert({
    name, speciality, contact_primary, contact_alternate, reference, notes, star_rating, attachment_url
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ poc: data }, { status: 201 });
}
