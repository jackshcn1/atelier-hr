import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env.local manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value) env[key.trim()] = value.join('=').trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql = fs.readFileSync('supabase/migrations/20261017100000_add_maintenance_module.sql', 'utf8');
  console.log('Attempting to execute SQL via RPC...');

  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.error('RPC exec_sql failed:', error.message);
    // Many Supabase projects do not have exec_sql enabled by default.
  } else {
    console.log('Migration executed successfully via RPC!', data);
  }
}

run();
