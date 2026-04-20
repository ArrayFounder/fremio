import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DownloadPage from "./DownloadPage";
import type { DownloadData } from "@/app/api/download/[qrCode]/route";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { qrCode: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetcher — dipakai oleh metadata DAN render
// ─────────────────────────────────────────────────────────────────────────────

async function fetchDownloadData(qrCode: string): Promise<DownloadData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/download/${qrCode}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiResponse<DownloadData>;
    return body.success ? body.data : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generateMetadata — OG tags untuk share preview
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await fetchDownloadData(params.qrCode);

  if (!data) {
    return {
      title: "Foto Tidak Ditemukan",
      robots: "noindex",
    };
  }

  const title       = `Foto dari ${data.boothName} 📸`;
  const description = `Lihat dan download foto dari ${data.boothName} oleh ${data.operatorName} · via fremio.id`;
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "https://studio.fremio.id";
  const pageUrl     = `${appUrl}/download/${params.qrCode}`;

  return {
    title,
    description,
    robots: "noindex, nofollow",  // link privat per-session
    openGraph: {
      type:        "website",
      url:         pageUrl,
      title,
      description,
      siteName:    data.operatorName,
      images: [
        {
          url:    data.photoUrl,
          width:  1200,
          height: 1800,
          alt:    `Foto dari ${data.boothName}`,
        },
      ],
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description,
      images:      [data.photoUrl],
    },
    // Viewport untuk mobile
    viewport: {
      width:               "device-width",
      initialScale:        1,
      maximumScale:        1,
      userScalable:        false,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function DownloadPageRoute({ params }: PageProps) {
  const data = await fetchDownloadData(params.qrCode);

  if (!data) notFound();

  return <DownloadPage data={data} />;
}
