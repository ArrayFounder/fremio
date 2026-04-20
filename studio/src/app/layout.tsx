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
      <body className="bg-surface text-primary-900 antialiased">
        {children}
      </body>
    </html>
  );
}
