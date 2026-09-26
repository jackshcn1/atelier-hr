import LogoutButton from './components/LogoutButton';

export const metadata = {
  title: 'Atelier HR',
  description: 'Internal HR administration tool',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#f7f7f8', color: '#1a1a1a' }}>
        <nav style={{
          display: 'flex', gap: '1.5rem', padding: '1rem 2rem',
          background: '#1f2937', color: 'white', alignItems: 'center'
        }}>
          <strong style={{ marginRight: 'auto' }}>Atelier HR</strong>
          <a href="/employees" style={{ color: 'white', textDecoration: 'none' }}>Employees</a>
          <a href="/employees/all" style={{ color: 'white', textDecoration: 'none' }}>All Employees</a>
          <a href="/orgchart" style={{ color: 'white', textDecoration: 'none' }}>Org Chart</a>
          <a href="/settings" style={{ color: 'white', textDecoration: 'none' }}>Payroll Settings</a>
          <a href="/settings/document-templates" style={{ color: 'white', textDecoration: 'none' }}>Doc Templates</a>
          <a href="/export" style={{ color: 'white', textDecoration: 'none' }}>Export</a>
          <a href="/payroll" style={{ color: 'white', textDecoration: 'none' }}>Payroll</a>
          <a href="/payroll/processing" style={{ color: '#93c5fd', textDecoration: 'none', fontWeight: 500 }}>Salary Processing</a>
          <a href="/payslips" style={{ color: '#6ee7b7', textDecoration: 'none', fontWeight: 500 }}>Payslips</a>
          <a href="/login" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Log in</a>
          <LogoutButton />
        </nav>
        <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
