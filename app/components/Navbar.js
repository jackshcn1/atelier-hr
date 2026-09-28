'use client';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

export default function Navbar() {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        checkUserRole(session.user);
      } else {
        setIsAdmin(false);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      await checkUserRole(user);
    }
    setLoading(false);
  }

  async function checkUserRole(userObj) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, permissions')
      .eq('id', userObj.id)
      .maybeSingle();

    const isManagement = profile?.is_super_admin ||
      profile?.role === 'admin' ||
      profile?.role === 'super_admin' ||
      profile?.role === 'hr_manager' ||
      profile?.role === 'department_head' ||
      profile?.permissions?.manage_users ||
      profile?.permissions?.view_employees ||
      profile?.permissions?.view_payroll;

    setIsAdmin(!!isManagement);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    router.push('/login');
    router.refresh();
  }

  // Hide on print
  if (pathname?.startsWith('/payslips/') && pathname !== '/payslips') {
    // Individual print page handles its own print styles
  }

  const isLoginPage = pathname === '/login';

  return (
    <nav
      className="no-print"
      style={{
        display: 'flex',
        gap: '1rem',
        padding: '0.8rem 1.5rem',
        background: '#111827',
        color: 'white',
        alignItems: 'center',
        flexWrap: 'wrap',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      <a
        href={isAdmin ? '/payroll' : '/my-payslips'}
        style={{
          marginRight: 'auto',
          color: 'white',
          textDecoration: 'none',
          fontWeight: 800,
          fontSize: 16,
          letterSpacing: 0.5
        }}
      >
        ATELIER HR
      </a>

      {user ? (
        isAdmin ? (
          /* Full Admin Nav Items */
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <a href="/employees" style={{ color: pathname === '/employees' ? '#93c5fd' : 'white', textDecoration: 'none' }}>Employees</a>
            <a href="/orgchart" style={{ color: pathname === '/orgchart' ? '#93c5fd' : '#e2e8f0', textDecoration: 'none' }}>Org Chart</a>
            <a href="/tasks" style={{ color: pathname === '/tasks' || pathname === '/checklists' ? '#86efac' : '#bbf7d0', textDecoration: 'none', fontWeight: 600 }}>✅ Tasks & Checklists</a>
            <a href="/payroll" style={{ color: pathname === '/payroll' ? '#93c5fd' : '#f9fafb', textDecoration: 'none', fontWeight: pathname === '/payroll' ? 700 : 500 }}>Payroll</a>
            <a href="/payroll/variable-pay" style={{ color: pathname?.startsWith('/payroll/variable-pay') ? '#6ee7b7' : '#93c5fd', textDecoration: 'none', fontWeight: 600 }}>🎯 Variable Pay</a>
            <a href="/payroll/processing" style={{ color: pathname === '/payroll/processing' ? '#6ee7b7' : '#93c5fd', textDecoration: 'none', fontWeight: 600 }}>Salary Processing</a>
            <a href="/payslips" style={{ color: pathname === '/payslips' ? '#6ee7b7' : '#e5e7eb', textDecoration: 'none', fontWeight: 600 }}>Payslips</a>
            <a href="/documents" style={{ color: pathname === '/documents' ? '#fde047' : '#fef08a', textDecoration: 'none', fontWeight: 600 }}>📚 SOPs & Training</a>
            <a href="/settings" style={{ color: pathname === '/settings' ? '#93c5fd' : '#cbd5e1', textDecoration: 'none' }}>Settings</a>
            <a href="/export" style={{ color: pathname === '/export' ? '#93c5fd' : '#cbd5e1', textDecoration: 'none' }}>Export</a>
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent', color: '#cbd5e1', border: '1px solid #475569',
                borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12
              }}
            >
              Log out
            </button>
          </div>
        ) : (
          /* Simple Employee Nav Items */
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: 13 }}>
            <a
              href="/tasks"
              style={{
                color: '#86efac',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: 14
              }}
            >
              ✅ Tasks & Checklists
            </a>
            <a
              href="/my-payslips"
              style={{
                color: '#6ee7b7',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: 14
              }}
            >
              📄 My Payslips
            </a>
            <a
              href="/documents"
              style={{
                color: '#fef08a',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: 14
              }}
            >
              📚 SOPs & Training
            </a>
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent', color: '#cbd5e1', border: '1px solid #475569',
                borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12
              }}
            >
              Log out
            </button>
          </div>
        )
      ) : (
        !isLoginPage && (
          <a href="/login" style={{ color: '#93c5fd', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
            Log in →
          </a>
        )
      )}
    </nav>
  );
}
