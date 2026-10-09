'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();

  const modules = [
    {
      title: 'HRMS',
      subtitle: 'Employee Management & Operations',
      description: 'Employees, onboarding, payroll, checklists, tasks, and documents',
      href: '/employees',
      accent: '#7c5c3b',
    },
    {
      title: 'Operations',
      subtitle: 'Assets, Maintenance & Compliance',
      description: 'Asset inventory with employee linking, work orders, compliance licenses',
      href: '/operations/assets',
      accent: '#8b6f4e',
    },
    {
      title: 'Sales',
      subtitle: 'Analytics & CEO Dashboard',
      description: 'Daily sales data, performance metrics, and executive insights',
      href: '/sales',
      accent: '#6b4423',
    },
  ];

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812] font-sans">
      <div className="max-w-shell mx-auto px-6 py-24 lg:py-32">
        {/* Page Header */}
        <div className="page-head mb-16 lg:mb-20 text-center">
          <h1 className="page-title font-serif text-4xl lg:text-6xl text-[#1e1812] mb-4 leading-tight tracking-tight">
            Atelier HR
          </h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg max-w-md mx-auto">
            Unified platform for Human Resources, Operations, and Sales
          </p>
        </div>

        {/* Module Selector Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {modules.map((mod) => (
            <Link
              key={mod.title}
              href={mod.href}
              className="group block"
            >
              <article className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm hover:shadow-md transition-all duration-300 h-full flex flex-col overflow-hidden hover:-translate-y-0.5">
                <div className="panel-body p-8 lg:p-10 flex flex-col h-full">
                  <div
                    className="w-3 h-3 rounded-full mb-6"
                    style={{ backgroundColor: mod.accent }}
                    aria-hidden="true"
                  />
                  <h2 className="font-serif text-2xl lg:text-3xl text-[#1e1812] mb-2 leading-snug">
                    {mod.title}
                  </h2>
                  <p className="text-[#8b6f4e] text-sm font-medium mb-4 tracking-wide uppercase">
                    {mod.subtitle}
                  </p>
                  <p className="text-[#6b635c] text-sm leading-relaxed mb-6">
                    {mod.description}
                  </p>
                  <div className="mt-auto pt-6 border-t border-[#ebe8e4]">
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-[#1e1812] group-hover:text-[#8b6f4e] transition-colors">
                      Open Module
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2.5 7h9M8 3.5L12 7l-4 3.5" />
                      </svg>
                    </span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
