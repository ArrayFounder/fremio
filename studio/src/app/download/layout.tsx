import type { ReactNode } from "react";

// Standalone layout untuk halaman download — tanpa navbar, tanpa auth
export default function DownloadLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
