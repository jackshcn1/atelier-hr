import Navbar from './components/Navbar';
import './globals.css';

export const metadata = {
  title: 'Atelier HR',
  description: 'Internal HR administration & Employee Self-Service tool',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Newsreader for headings, Inter for everything else. Loaded from
            next/font so they are self-hosted — no third-party request on every
            page load, and no layout shift while they load. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased min-h-screen bg-page text-ink">
        <Navbar />
        <main className="mx-auto w-full max-w-shell px-6 py-12 sm:px-10 sm:py-16">
          {children}
        </main>
      </body>
    </html>
  );
}