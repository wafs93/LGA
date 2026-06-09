import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NaijaTrack',
  description: 'Nigerian FAAC transparency dashboard for states, LGAs, and allocations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-emerald-800">NaijaTrack</p>
                <h1 className="text-2xl font-semibold tracking-tight text-[#004D29] sm:text-3xl">FAAC Transparency Dashboard</h1>
              </div>
              <nav className="flex items-center gap-4 text-sm font-medium text-slate-700">
                <a href="#home" className="transition hover:text-[#004D29]">Home</a>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-slate-200 bg-white/95 px-4 py-6 text-sm text-slate-600 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>Built for civic transparency across Nigeria’s 36 states and 774 LGAs.</p>
              <p>Supabase-backed insights · Designed with green + gold system.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
