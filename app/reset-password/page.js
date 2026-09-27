'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleUpdatePassword(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword
    });

    setLoading(false);
    if (updateErr) {
      setError(updateErr.message || 'Failed to reset password. The reset link may have expired.');
    } else {
      setMessage('✓ Password successfully updated! Redirecting to login...');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    }
  }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 12px' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'white',
          borderRadius: 12,
          padding: '28px 24px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: '0 0 6px 0', fontSize: 22, fontWeight: 800, color: '#111827' }}>
            Set New Password
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
            Enter your new admin account password below.
          </p>
        </div>

        {message && (
          <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '10px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              New Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Confirm New Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '11px',
              background: '#1f2937',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              marginTop: 6
            }}
          >
            {loading ? 'Updating Password...' : '✓ Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
