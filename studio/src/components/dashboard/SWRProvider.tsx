"use client";
import { SWRConfig } from "swr";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 10_000 }}>
        {children}
      </SWRConfig>
    </SessionProvider>
  );
}
