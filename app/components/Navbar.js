'use client';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

// Navigation is the shell, so it sets the tone for everything under it.
//
// No emoji as icons: they render differently on every platform and undercut an
// otherwise restrained interface. The one place colour appears is the active
// link, and it is the same accent used for the single figure that matters on a
// page — so "where am I" and "what matters here" read as the same idea.

const ADMIN_LINKS = [
  { href: '/employees', label: 'Employees' },
  { href: '/orgchart', label: 'Org chart' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/documents', label: 'SOPs' },
  { href: '/payroll/variable-pay/attainment', label: 'Attainment' },
  { href: '/my-variable-pay', label: 'My variable pay' },
  { href: '/payroll', label: 'Payroll' },
  { href: '/payroll/processing', label: 'Salary processing' },
  { href: '/payslips', label: 'Payslips' },
  { href: '/export', label: 'Export' },
  { href: '/settings', label: 'Settings' },
];

const EMPLOYEE_LINKS = [
  { href: '/my-variable-pay', label: 'My variable pay' },
  { href: '/my-payslips', label: 'My payslips' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/documents', label: 'SOPs' },
];

function isActive(pathname, href) {
  if (href === '/tasks') return pathname === '/tasks' || pathname === '/checklists';
  return pathname === href || pathname?.startsWith(`${href}/`);
}

export default function Navbar() {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Close the mobile menu whenever navigation happens.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  async function checkUser() {
    const { data: { user: u } } = await supabase.auth.getUser();
    setUser(u);
    if (u) {
      await checkUserRole(u);
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
      profile?.permissions?.edit_employees ||
      profile?.permissions?.manage_settings ||
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

  const isLoginPage = pathname === '/login';
  const links = isAdmin ? ADMIN_LINKS : EMPLOYEE_LINKS;

  // Sign in only — no chrome around a page that has no content yet.
  if (isLoginPage) return null;

  const linkClass = (href) => [
    'px-2.5 py-1.5 rounded-control text-sm transition-colors whitespace-nowrap',
    isActive(pathname, href)
      ? 'text-ink font-medium bg-page'
      : 'text-ink-muted hover:text-ink hover:bg-page/70',
  ].join(' ');

  return (
    <nav className="no-print sticky top-0 z-40 border-b border-rule bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-shell flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 sm:px-8">
        <a
          href={isAdmin ? '/payroll' : '/my-variable-pay'}
          className="mr-auto font-serif text-[1.05rem] font-medium tracking-tight text-ink"
        >
          Atelier
        </a>

        {loading ? null : user ? (
          <>
            {/* Desktop: single quiet row. Eleven links will not fit at every
                width, so anything narrower gets the disclosure menu. */}
            <div className="hidden items-center gap-0.5 lg:flex">
              {links.map(l => (
                <a key={l.href} href={l.href} className={linkClass(l.href)}>{l.label}</a>
              ))}
            </div>

            <button
              onClick={handleLogout}
              className="btn-quiet hidden text-xs lg:inline-flex"
            >
              Sign out
            </button>

            {/* Narrow screens */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="btn-secondary px-3 py-1.5 text-xs lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="primary-navigation"
            >
              Menu
            </button>

            {menuOpen && (
              <div
                id="primary-navigation"
                className="w-full animate-settle border-t border-rule-soft pt-3 lg:hidden"
              >
                <div className="flex flex-col gap-0.5">
                  {links.map(l => (
                    <a key={l.href} href={l.href} className={`${linkClass(l.href)} py-2`}>{l.label}</a>
                  ))}
                  <button
                    onClick={handleLogout}
                    className="btn-quiet self-start px-2.5 py-2 text-sm"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <a href="/login" className="btn-primary">Sign in</a>
        )}
      </div>
    </nav>
  );
}