'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  // Mode: 'employee' (OTP) | 'admin' (Password)
  const [loginMode, setLoginMode] = useState('employee');

  // Employee OTP state
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Admin Password state
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loggingInAdmin, setLoggingInAdmin] = useState(false);

  // Forgot Password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // 1. Employee: Send Email OTP
  async function handleSendOtp(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    const email = employeeEmail.trim().toLowerCase();
    if (!email) {
      setError('Please enter your registered email address.');
      return;
    }

    setSendingOtp(true);
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true
      }
    });

    setSendingOtp(false);
    if (otpErr) {
      setError(otpErr.message || 'Failed to send login code. Please verify your email.');
    } else {
      setOtpSent(true);
      setMessage(`✓ A 6-digit login code has been sent to ${email}. Please check your inbox.`);
    }
  }

  // 2. Employee: Verify Email OTP
  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    const email = employeeEmail.trim().toLowerCase();
    const token = otpCode.trim();

    if (!token) {
      setError('Please enter the 6-digit code received on your email.');
      return;
    }

    setVerifyingOtp(true);
    const { data, error: verifyErr } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });

    setVerifyingOtp(false);
    if (verifyErr) {
      setError(verifyErr.message || 'Invalid or expired login code. Please try again.');
    } else {
      // Check if user is an admin or employee to route accordingly
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_super_admin, permissions, access_status')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile?.access_status === 'revoked' || profile?.access_status === 'inactive') {
        await supabase.auth.signOut();
        setError('Your platform access has been revoked or expired. Please contact management.');
        return;
      }

      if (profile?.is_super_admin || profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.permissions?.manage_users) {
        router.push('/payroll');
      } else {
        router.push('/my-payslips');
      }
      router.refresh();
    }
  }

  // 3. Admin: Password Login
  async function handleAdminLogin(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoggingInAdmin(true);

    const { data, error: loginErr } = await supabase.auth.signInWithPassword({
      email: adminEmail.trim(),
      password: adminPassword
    });

    setLoggingInAdmin(false);
    if (loginErr) {
      setError(loginErr.message);
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('access_status')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile?.access_status === 'revoked' || profile?.access_status === 'inactive') {
        await supabase.auth.signOut();
        setError('Your access has been revoked. Contact the administrator.');
        return;
      }

      router.push('/payroll');
      router.refresh();
    }
  }

  // 4. Admin: Forgot Password Reset Email
  async function handleForgotPassword(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    const email = resetEmail.trim();

    if (!email) {
      setError('Please enter your admin email address.');
      return;
    }

    setSendingReset(true);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    setSendingReset(false);
    if (resetErr) {
      setError(resetErr.message);
    } else {
      setMessage(`✓ Password reset instructions sent to ${email}. Check your email.`);
      setShowForgotPassword(false);
      setResetEmail('');
    }
  }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 12px' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'white',
          borderRadius: 12,
          padding: '28px 24px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          boxSizing: 'border-box'
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 6px 0', fontSize: 24, fontWeight: 800, color: '#111827', letterSpacing: 0.5 }}>
            ATELIER HR
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
            {loginMode === 'employee' ? 'Employee Payslip & Self-Service Portal' : 'Admin & Management Portal'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#f3f4f6', padding: 4, borderRadius: 8, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => { setLoginMode('employee'); setShowForgotPassword(false); setError(''); setMessage(''); }}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: loginMode === 'employee' ? 'white' : 'transparent',
              color: loginMode === 'employee' ? '#111827' : '#6b7280',
              boxShadow: loginMode === 'employee' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            👤 Employee (OTP)
          </button>
          <button
            type="button"
            onClick={() => { setLoginMode('admin'); setShowForgotPassword(false); setError(''); setMessage(''); }}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: loginMode === 'admin' ? 'white' : 'transparent',
              color: loginMode === 'admin' ? '#111827' : '#6b7280',
              boxShadow: loginMode === 'admin' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            🔑 Admin Login
          </button>
        </div>

        {/* Alert Notifications */}
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

        {/* Form 1: Employee Email OTP Login */}
        {loginMode === 'employee' ? (
          <div>
            {!otpSent ? (
              <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Registered Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={employeeEmail}
                    onChange={e => setEmployeeEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>
                    Enter the email registered on your Atelier employee profile.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={sendingOtp}
                  style={{
                    padding: '11px',
                    background: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    marginTop: 4
                  }}
                >
                  {sendingOtp ? 'Sending Login Code...' : 'Send Login Code (OTP) →'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Enter 6-Digit Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="123456"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value)}
                    maxLength={6}
                    autoFocus
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      textAlign: 'center',
                      letterSpacing: 6,
                      fontSize: 20,
                      fontWeight: 'bold',
                      borderRadius: 6,
                      border: '1px solid #059669',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Sent to {employeeEmail}</span>
                    <button
                      type="button"
                      onClick={() => { setOtpSent(false); setOtpCode(''); setError(''); setMessage(''); }}
                      style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                    >
                      Change Email
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={verifyingOtp}
                  style={{
                    padding: '11px',
                    background: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    marginTop: 4
                  }}
                >
                  {verifyingOtp ? 'Verifying Code...' : '✓ Log In to My Portal'}
                </button>

                <div style={{ textAlign: 'center', marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={sendingOtp}
                    style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Resend Code
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : showForgotPassword ? (
          /* Form 3: Forgot Password */
          <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Admin Email for Password Recovery
              </label>
              <input
                type="email"
                placeholder="admin@atelier.com"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>
                We'll send a secure password reset link to this email address.
              </span>
            </div>

            <button
              type="submit"
              disabled={sendingReset}
              style={{
                padding: '11px',
                background: '#1f2937',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              {sendingReset ? 'Sending Link...' : 'Send Reset Link →'}
            </button>

            <button
              type="button"
              onClick={() => { setShowForgotPassword(false); setError(''); }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              ← Back to Admin Login
            </button>
          </form>
        ) : (
          /* Form 2: Admin Password Login */
          <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Admin Email
              </label>
              <input
                type="email"
                placeholder="admin@atelier.com"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                required
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(true); setResetEmail(adminEmail); setError(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline'
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                required
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
              disabled={loggingInAdmin}
              style={{
                padding: '11px',
                background: '#1f2937',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                marginTop: 4
              }}
            >
              {loggingInAdmin ? 'Logging in...' : 'Log In as Admin →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
