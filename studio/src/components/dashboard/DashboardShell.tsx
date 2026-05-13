"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Sidebar } from "@/components/dashboard/Sidebar";

interface Props {
  businessName: string;
  email: string;
  tier: string;
  children: React.ReactNode;
}

export function DashboardShell({ businessName, email, tier, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await document.documentElement.requestFullscreen();
    } catch {
      // Ignore browser-level fullscreen rejection (gesture/policy/device specific).
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        businessName={businessName}
        email={email}
        tier={tier}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-primary-100 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-200 bg-white text-primary-900 shadow-sm transition-transform active:scale-95"
              aria-label="Buka sidebar"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex min-w-0 items-center gap-2">
              <Image src="/fremio_studio.png" alt="Fremio Studio" width={150} height={48} className="h-8 w-auto" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 text-sm font-semibold text-primary-700 shadow-sm transition-colors hover:bg-primary-50"
              aria-label={isFullscreen ? "Keluar dari fullscreen" : "Masuk fullscreen"}
              title={isFullscreen ? "Keluar fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9H5V5m10 0h4v4m0 10v4h-4m-6 0H5v-4" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4" />
                </svg>
              )}
              <span className="hidden sm:inline">{isFullscreen ? "Exit" : "Fullscreen"}</span>
            </button>

            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-semibold text-gray-700">{businessName}</p>
              <p className="truncate text-xs text-gray-400">{tier}</p>
            </div>
          </div>
        </header>

        <main data-dashboard-scroll="true" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}