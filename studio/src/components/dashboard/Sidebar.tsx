"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const NAV = [
  { href: "/dashboard",     label: "Beranda",       icon: "🏠" },
  { href: "/booths",        label: "Booth",         icon: "📷" },
  { href: "/sessions",      label: "Transaksi",     icon: "💳" },
  { href: "/agent",         label: "Fremio Studio", icon: "🖨️" },
];

interface Props {
  businessName: string;
  email: string;
  tier: string;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ businessName, email, tier, open, onClose }: Props) {
  const pathname = usePathname();

  const tierLabel: Record<string, string> = {
    STARTER: "Starter",
    PRO: "Pro",
    ENTERPRISE: "Enterprise",
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={onClose}
        />
      )}

      <aside
        className={[
          "fixed top-0 left-0 z-50 flex h-full w-72 max-w-[86vw] flex-col border-r border-primary-200 bg-primary-50 shadow-xl",
          "transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="px-5 py-6 border-b border-primary-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Image src="/logo-salem.png" alt="fremio" width={90} height={28} className="h-6 w-auto" />
              <span className="text-primary-400 text-[10px] uppercase tracking-widest mt-0.5 font-semibold">studio</span>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-primary-200 bg-white text-primary-700"
              aria-label="Tutup sidebar"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-primary-900 font-semibold text-sm mt-3 truncate">{businessName}</p>
          <p className="text-primary-500 text-xs truncate">{email}</p>
          <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-bold bg-primary-100 text-primary-700 border border-primary-200">
            {tierLabel[tier] ?? tier}
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
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
