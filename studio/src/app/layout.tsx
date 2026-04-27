import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    template: "%s | Fremio Studio",
    default:  "Fremio Studio — Software Photobox untuk Bisnis",
  },
  description:
    "Platform software photobox white-label untuk pemilik bisnis booth foto offline di Indonesia.",
  robots: { index: false, follow: false }, // stealth sampai launch
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=DM+Sans:wght@400;500;700&family=Urbanist:wght@400;500;600;700&family=Mulish:wght@400;600;700&family=Outfit:wght@400;500;600;700&family=Red+Hat+Display:wght@400;500;700&family=Lexend:wght@400;500;700&family=Public+Sans:wght@400;500;700&family=Figtree:wght@400;500;700&family=DM+Serif+Display&family=Fraunces:wght@400;700&family=Spectral:wght@400;600&family=Lora:wght@400;600&family=Crimson+Pro:wght@400;600&family=Alegreya:wght@400;700&family=Bodoni+Moda:wght@400;700&family=Cormorant+Infant:wght@400;600&family=Archivo+Black&family=Space+Grotesk:wght@400;500;700&family=Syne:wght@400;700&family=Unbounded:wght@400;700&family=Sacramento&family=Allura&family=Dancing+Script:wght@400;700&family=Satisfy&family=Caveat:wght@400;700&family=Patrick+Hand&family=Archivo+Narrow:wght@400;600&family=Encode+Sans:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@400;600&family=Barlow+Condensed:wght@400;600&family=Saira+Condensed:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-surface text-primary-900 antialiased">
        {children}
      </body>
    </html>
  );
}
