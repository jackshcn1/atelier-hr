import Navbar from './components/Navbar';

export const metadata = {
  title: 'Atelier HR',
  description: 'Internal HR administration & Employee Self-Service tool',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0, background: '#f7f7f8', color: '#1a1a1a', minHeight: '100vh' }}>
        <Navbar />
        <main style={{ padding: '1.25rem', maxWidth: 1000, margin: '0 auto', boxSizing: 'border-box' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
