'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push('/employees');
    }
  }

  return (
    <div style={{ maxWidth: 360 }}>
      <h1>Log in</h1>
      <p style={{ color: '#555', fontSize: 14 }}>
        Accounts are created by the admin in Supabase directly — there's no public sign-up.
      </p>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)} required
          style={{ padding: 8 }} />
        <input type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)} required
          style={{ padding: 8 }} />
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" style={{ padding: 10, background: '#1f2937', color: 'white', border: 'none', borderRadius: 4 }}>
          Log in
        </button>
      </form>
    </div>
  );
}
