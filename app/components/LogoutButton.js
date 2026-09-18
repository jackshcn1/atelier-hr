'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <button onClick={handleLogout} style={{
      background: 'transparent', color: '#cbd5e1', border: '1px solid #475569',
      borderRadius: 4, padding: '4px 10px', cursor: 'pointer'
    }}>
      Log out
    </button>
  );
}
