"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";

const NAV = [
  { href: "/dashboard",     label: "Beranda",       icon: "🏠" },
  { href: "/booths",        label: "Booth",         icon: "📷" },
  { href: "/frames",        label: "Frame",         icon: "🖼️" },
  { href: "/sessions",      label: "Transaksi",     icon: "💳" },
  { href: "/settings",      label: "Pengaturan",    icon: "⚙️" },
  { href: "/setup",         label: "Panduan Setup", icon: "📖" },
  { href: "/agent",         label: "Download Agent",icon: "🖨️" },
];

interface Props {
  businessName: string;
  email:        string;
  tier:         string;
}

export function Sidebar({ businessName, email, tier }: Props) {
  const pathname   = usePathname();
  const [open, setOpen] = useState(false);

  const tierLabel: Record<string, string> = {
    STARTER:    "Starter",
    PRO:        "Pro",
    ENTERPRISE: "Enterprise",
  };

  return (
    <>
      {/* ── Mobile top bar ── */}
      <header className="md:hidden flex items-center justify-between bg-primary-900 text-white px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Image src="/logo-salem.png" alt="fremio" width={72} height={22} className="h-5 w-auto brightness-0 invert" />
          <span className="text-white/40 text-[10px] uppercase tracking-widest">studio</span>
        </div>
        <button onClick={() => setOpen(true)} className="p-1 rounded-lg active:bg-white/10">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* ── Mobile drawer backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Sidebar (desktop: fixed left column; mobile: drawer) ── */}
      <aside
        className={[
          "fixed top-0 left-0 h-full w-64 bg-primary-50 border-r border-primary-200 z-50 flex flex-col",
          "transition-transform duration-200",
          "md:translate-x-0 md:static md:flex",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* Logo / brand */}
        <div className="px-5 py-6 border-b border-primary-200">
          <div className="flex items-center gap-2">
            <Image src="/logo-salem.png" alt="fremio" width={90} height={28} className="h-6 w-auto" />
            <span className="text-primary-400 text-[10px] uppercase tracking-widest mt-0.5 font-semibold">studio</span>
          </div>
          <p className="text-primary-900 font-semibold text-sm mt-3 truncate">{businessName}</p>
          <p className="text-primary-500 text-xs truncate">{email}</p>
          <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-bold bg-primary-100 text-primary-700 border border-primary-200">
            {tierLabel[tier] ?? tier}
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-100 text-primary-900 font-semibold"
                    : "text-primary-700 hover:bg-primary-100 hover:text-primary-900",
                ].join(" ")}
              >
                <span className="text-lg">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="px-5 py-5 border-t border-primary-200">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-2 text-primary-500 text-sm hover:text-primary-900 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Keluar
          </button>
        </div>
      </aside>
    </>
  );
}
