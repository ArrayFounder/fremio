import { notFound } from "next/navigation";
import { BoothClient } from "./BoothClient";
import type { BoothConfigData, FrameData } from "./types";
import type { Metadata } from "next";

// Booth UI selalu fresh — tidak di-cache
export const dynamic = "force-dynamic";

interface PageProps {
  params:      { slug: string };
  searchParams: { preview?: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title:  `Booth`,
    robots: "noindex, nofollow",
  };
}

function BoothError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">📷</div>
        <h1 className="text-white text-xl font-bold mb-2">Booth Tidak Tersedia</h1>
        <p className="text-gray-400 text-sm">{message}</p>
      </div>
    </div>
  );
}

export default async function BoothPage({ params, searchParams }: PageProps) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/booth/${params.slug}`, {
    cache: "no-store",
  }).catch(() => null);

  if (!res) return <BoothError message="Tidak dapat terhubung ke server. Coba beberapa saat lagi." />;

  if (res.status === 404) notFound();

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    return <BoothError message={body.error ?? "Booth sedang tidak aktif."} />;
  }

  const body = await res.json() as {
    success: boolean;
    data?:   { booth: BoothConfigData; frames: FrameData[] };
    error?:  string;
  };

  if (!body.success || !body.data) notFound();

  const { booth, frames } = body.data;

  return <BoothClient booth={booth} frames={frames} previewScreen={searchParams.preview} />;
}
