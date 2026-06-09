import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NaijaTrack — Follow Every Naira',
  description: "Nigeria's most advanced government transparency platform. Track FAAC allocations to all 36 states and 774 LGAs.",
  openGraph: {
    title: 'NaijaTrack — Follow Every Naira',
    description: "Track how much Federal Government sends to your state and LGA every month.",
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer>
          <div className="footer-inner">
            <span className="footer-logo">Naija<span>Track</span></span>
            <p>Data sourced from <a href="https://oagf.gov.ng" target="_blank" rel="noopener">OAGF</a> and <a href="https://rmafc.gov.ng" target="_blank" rel="noopener">RMAFC</a> monthly FAAC communiqués. Updated automatically each month.</p>
            <p style={{marginTop: 8}}>Built for Nigerian citizens. <a href="mailto:hello@naijatrack.ng">Contact us</a> · <a href="#">Methodology</a></p>
          </div>
        </footer>
      </body>
    </html>
  )
}
