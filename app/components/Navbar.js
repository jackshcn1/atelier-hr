'use client';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

const ADMIN_NAV = [
  {
    label: 'Employees',
    links: [
      { href: '/employees', label: 'Employees' },
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
      { href: '/payroll', label: 'Payroll' },
      { href: '/payroll/processing', label: 'Salary Processing' },
      { href: '/my-variable-pay', label: 'My Variable Pay' },
      { href: '/payroll/variable-pay/attainment', label: 'Attainment' },
      { href: '/payslips', label: 'Payslips' },
    ]
  },
  {
    label: 'Documents',
    links: [
      { href: '/documents?category=sop', label: 'SOPs and Workflows' },
      { href: '/documents?category=training', label: 'Training Material' },
      { href: '/documents?category=targets', label: 'Variable Pay Targets' },
      { href: '/documents?category=policy', label: 'Company Policies' },
      { href: '/documents?category=onboarding_documentation', label: 'Onboarding Terms & Clauses' },
    ]
  },
];

const ADMIN_STANDALONE = [
  { href: '/export', label: 'Export' },
  { href: '/settings', label: 'Settings' },
];

const EMPLOYEE_NAV = [
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
      { href: '/my-variable-pay', label: 'My Variable Pay' },
      { href: '/my-payslips', label: 'My Payslips' },
    ]
  },
  {
    label: 'Documents',
    links: [
      { href: '/documents?category=sop', label: 'SOPs and Workflows' },
      { href: '/documents?category=training', label: 'Training Material' },
      { href: '/documents?category=targets', label: 'Variable Pay Targets' },
      { href: '/documents?category=policy', label: 'Company Policies' },
    ]
  },
];

function isLinkActive(pathname, href) {
  const pathOnly = href.split('?')[0];
  if (pathOnly === '/tasks') return pathname === '/tasks';
  if (pathOnly === '/checklists') return pathname === '/checklists';
  if (pathOnly === '/documents') return pathname === '/documents';
  return pathname === pathOnly || pathname?.startsWith(`${pathOnly}/`);
}

function hasActiveChild(pathname, links) {
  return links.some(link => isLinkActive(pathname, link.href));
}

export default function Navbar() {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);

  const dropdownRef = useRef(null);

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

  // Close menus on page change
  useEffect(() => {
    setMenuOpen(false);
    setActiveDropdown(null);
  }, [pathname]);

  // Click outside to close desktop dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      profile?.role === 'hr_manager' ||
      profile?.role === 'department_head' ||
      profile?.permissions?.manage_users ||
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
  if (isLoginPage) return null;

  const navGroups = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;
  const standaloneLinks = isAdmin ? ADMIN_STANDALONE : [];

  const linkClass = (href) => [
    'px-3 py-1.5 rounded-control text-sm transition-colors whitespace-nowrap',
    isLinkActive(pathname, href)
      ? 'text-ink font-medium bg-page'
      : 'text-ink-muted hover:text-ink hover:bg-page/70',
  ].join(' ');

  const toggleDropdown = (label) => {
    setActiveDropdown(prev => (prev === label ? null : label));
  };

  return (
    <nav className="no-print sticky top-0 z-40 border-b border-rule bg-surface/95 backdrop-blur" ref={dropdownRef}>
      <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3.5 sm:px-10">
        <a
          href={isAdmin ? '/payroll' : '/my-variable-pay'}
          className="font-serif text-[1.3rem] leading-none tracking-tight text-ink hover:opacity-80 transition-opacity"
        >
          Atelier
        </a>

        {loading ? null : user ? (
          <>
            {/* Desktop Navigation with Dropdowns */}
            <div className="hidden items-center gap-1.5 lg:flex">
              {navGroups.map(group => {
                const isOpen = activeDropdown === group.label;
                const hasActive = hasActiveChild(pathname, group.links);

                return (
                  <div key={group.label} className="relative">
                    <button
                      type="button"
                      onClick={() => toggleDropdown(group.label)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-control text-sm transition-colors ${
                        hasActive || isOpen
                          ? 'text-ink font-medium bg-page'
                          : 'text-ink-muted hover:text-ink hover:bg-page/60'
                      }`}
                      aria-expanded={isOpen}
                    >
                      <span>{group.label}</span>
                      <svg
                        className={`w-3.5 h-3.5 text-ink-muted transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-ink' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="absolute top-full left-0 mt-1.5 w-56 rounded-card border border-rule bg-surface shadow-lg z-50 py-1.5 animate-settle">
                        {group.links.map(link => (
                          <a
                            key={link.href}
                            href={link.href}
                            onClick={() => setActiveDropdown(null)}
                            className={`block px-4 py-2 text-sm transition-colors ${
                              isLinkActive(pathname, link.href)
                                ? 'text-ink font-medium bg-page'
                                : 'text-ink-muted hover:text-ink hover:bg-page/70'
                            }`}
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {standaloneLinks.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className={linkClass(link.href)}
                >
                  {link.label}
                </a>
              ))}

              <div className="ml-2 pl-2 border-l border-rule-soft">
                <button
                  onClick={handleLogout}
                  className="btn-quiet text-xs px-2.5 py-1.5"
                >
                  Sign out
                </button>
              </div>
            </div>

            {/* Mobile Menu Trigger */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="btn-secondary px-3 py-1.5 text-xs lg:hidden flex items-center gap-1.5"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
            >
              <span>{menuOpen ? 'Close' : 'Menu'}</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Mobile Drawer Navigation */}
            {menuOpen && (
              <div
                id="mobile-navigation"
                className="w-full animate-settle border-t border-rule-soft pt-3 mt-2 lg:hidden"
              >
                <div className="flex flex-col gap-1.5 pb-2">
                  {navGroups.map(group => {
                    const isExpanded = activeDropdown === group.label || hasActiveChild(pathname, group.links);

                    return (
                      <div key={group.label} className="rounded-control border border-rule/50 bg-surface/50 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleDropdown(group.label)}
                          className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-medium text-ink"
                        >
                          <span>{group.label}</span>
                          <svg
                            className={`w-4 h-4 text-ink-muted transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-rule-soft/60 bg-page/40 px-2 py-1.5 space-y-1">
                            {group.links.map(link => (
                              <a
                                key={link.href}
                                href={link.href}
                                onClick={() => setMenuOpen(false)}
                                className={`block px-3 py-2 rounded-control text-sm transition-colors ${
                                  isLinkActive(pathname, link.href)
                                    ? 'text-ink font-medium bg-surface shadow-xs'
                                    : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                                }`}
                              >
                                {link.label}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {standaloneLinks.map(link => (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      className={`block px-3.5 py-2.5 rounded-control text-sm font-medium border border-rule/50 ${
                        isLinkActive(pathname, link.href)
                          ? 'text-ink bg-page'
                          : 'text-ink-muted bg-surface/50 hover:text-ink'
                      }`}
                    >
                      {link.label}
                    </a>
                  ))}

                  <div className="pt-2">
                    <button
                      onClick={handleLogout}
                      className="btn-quiet w-full justify-center text-xs py-2"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <a href="/login" className="btn-primary text-xs">Sign in</a>
        )}
      </div>
    </nav>
  );
}
