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

const NAV_STRUCTURE = [
  {
    label: 'Employees',
    links: [
      { href: '/employees', label: 'Employees' },
      { href: '/orgchart', label: 'Org Chart' },
    ]
  },
  {
    label: 'Operations',
    links: [
      { href: '/checklists', label: 'Checklists' },
      { href: '/tasks', label: 'Tasks' },
    ]
  },
  {
    label: 'Payroll',
    links: [
      { href: '/payroll/processing', label: 'Salary Processing' },
      { href: '/payroll', label: 'Payroll' },
      { href: '/payroll/variable-pay/attainment', label: 'Attainment' },
      { href: '/payroll/variable-pay', label: 'My Variable Pay' },
      { href: '/payslips', label: 'Payslips' },
    ]
  },
  {
    label: 'Documents',
    links: [
      { href: '/documents', label: 'SOPs and Workflows' },
      { href: '/documents/training', label: 'Training Material' },
      { href: '/documents/variable-pay-targets', label: 'Variable Pay Targets' },
      { href: '/documents/company-policies', label: 'Company Policies' },
    ]
  },
];

const STANDALONE_LINKS = [
  { href: '/export', label: 'Export' },
  { href: '/settings', label: 'Settings' },
];

function isActive(pathname, href) {
  if (href === '/tasks') return pathname === '/tasks' || pathname === '/checklists';
  return pathname === href || pathname?.startsWith(`${href}/`);
}

// Helper to check if any child link is active
function hasActiveChild(pathname, links) {
  return links.some(link => isActive(pathname, link.href));
}

export default function Navbar() {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState({});

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
  useEffect(() => {
    setMenuOpen(false);
    setOpenDropdowns({}); // Close all dropdowns on navigation
  }, [pathname]);

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

  // Sign in only — no chrome around a page that has no content yet.
  if (isLoginPage) return null;

  // Determine user links based on admin status
  const userLinks = isAdmin ? NAV_STRUCTURE : [
    { href: '/payroll/variable-pay', label: 'My Variable Pay' },
    { href: '/payslips', label: 'My Payslips' },
    { href: '/tasks', label: 'Tasks' },
    { href: '/documents', label: 'SOPs and Workflows' },
    { href: '/documents/training', label: 'Training Material' },
    { href: '/documents/variable-pay-targets', label: 'Variable Pay Targets' },
    { href: '/documents/company-policies', label: 'Company Policies' },
    { href: '/checklists', label: 'Checklists' },
  ];

  const linkClass = (href) => [
    'px-2.5 py-1.5 rounded-control text-sm transition-colors whitespace-nowrap',
    isActive(pathname, href)
      ? 'text-ink font-medium bg-page'
      : 'text-ink-muted hover:text-ink hover:bg-page/70',
  ].join(' ');

  const standaloneLinkClass = (href) => [
    'px-2.5 py-1.5 rounded-control text-sm transition-colors whitespace-nowrap',
    isActive(pathname, href)
      ? 'text-ink font-medium bg-page'
      : 'text-ink-muted hover:text-ink hover:bg-page/70',
  ].join(' ');

  const toggleDropdown = (label) => {
    setOpenDropdowns(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  return (
    <nav className="no-print sticky top-0 z-40 border-b border-rule bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-shell flex-wrap items-center gap-x-3 gap-y-2 px-6 py-4 sm:px-10">
        <a
          href={isAdmin ? '/payroll' : '/my-variable-pay'}
          className="mr-auto font-serif text-[1.25rem] leading-none tracking-tight text-ink"
        >
          Atelier
        </a>

        {loading ? null : user ? (
          <>
            {/* Desktop: dropdown navigation */}
            <div className="hidden items-center gap-1 lg:flex">
              {NAV_STRUCTURE.map(item => (
                item.standalone ? (
                  <a key={item.href} href={item.href} className={standaloneLinkClass(item.href)}>
                    {item.label}
                  </a>
                ) : (
                  <div key={item.label} className="relative group">
                    <button
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-control text-sm transition-colors ${hasActiveChild(pathname, item.links) ? 'text-ink font-medium bg-page' : 'text-ink-muted hover:text-ink hover:bg-page/70'}`}
                      onMouseEnter={() => setOpenDropdowns(prev => ({ ...prev, [item.label]: true }))}
                      onMouseLeave={() => setOpenDropdowns(prev => ({ ...prev, [item.label]: false }))}
                    >
                      {item.label}
                      <svg className="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {openDropdowns[item.label] && (
                      <div
                        className="absolute top-full left-0 mt-1 w-56 rounded-md border border-rule bg-surface shadow-lg z-50"
                        onMouseEnter={() => setOpenDropdowns(prev => ({ ...prev, [item.label]: true }))}
                        onMouseLeave={() => setOpenDropdowns(prev => ({ ...prev, [item.label]: false }))}
                      >
                        <div className="py-1">
                          {item.links.map(link => (
                            <a
                              key={link.href}
                              href={link.href}
                              className={`block px-4 py-2 text-sm ${linkClass(link.href)}`}
                              onClick={() => {
                                setMenuOpen(false);
                                setOpenDropdowns({});
                              }}
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              ))}
              {STANDALONE_LINKS.map(link => (
                <a key={link.href} href={link.href} className={standaloneLinkClass(link.href)}>
                  {link.label}
                </a>
              ))}

              <button
                onClick={handleLogout}
                className="btn-quiet ml-4 text-xs lg:inline-flex"
              >
                Sign out
              </button>
            </div>

            {/* Mobile: Hamburger menu with dropdowns */}
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
                  {NAV_STRUCTURE.map(item => (
                    <div key={item.label} className="flex flex-col">
                      <button
                        onClick={() => toggleDropdown(item.label)}
                        className={`flex items-center justify-between px-3 py-2 rounded-control text-sm transition-colors ${hasActiveChild(pathname, item.links) ? 'text-ink font-medium bg-page' : 'text-ink-muted hover:text-ink hover:bg-page/70'}`}
                      >
                        {item.label}
                        <svg
                          className={`w-4 h-4 transition-transform ${openDropdowns[item.label] ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {openDropdowns[item.label] && (
                        <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-rule-soft pl-4">
                          {item.links.map(link => (
                            <a
                              key={link.href}
                              href={link.href}
                              className={`${linkClass(link.href)} block py-1.5 text-sm`}
                              onClick={() => {
                                setMenuOpen(false);
                                setOpenDropdowns({});
                              }}
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {STANDALONE_LINKS.map(link => (
                    <a
                      key={link.href}
                      href={link.href}
                      className={`${standaloneLinkClass(link.href)} block px-3 py-2`}
                      onClick={() => {
                        setMenuOpen(false);
                        setOpenDropdowns({});
                      }}
                    >
                      {link.label}
                    </a>
                  ))}

                  <button
                    onClick={handleLogout}
                    className="btn-quiet self-start px-3 py-2 text-sm"
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