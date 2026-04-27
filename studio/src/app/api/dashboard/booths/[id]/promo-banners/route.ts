import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadPhoto, deletePhoto } from "@/lib/r2";
import type { ApiResponse } from "@/types";

type CtxParams = { params: { id: string } };

async function getOwnedBooth(boothId: string, operatorId: string) {
  const b = await prisma.boothConfig.findUnique({
    where: { id: boothId },
    select: { operatorId: true, welcomeScreenPrefs: true },
  });
  if (!b || b.operatorId !== operatorId) return null;
  return b;
}

function parsePrefs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

// ── GET — kembalikan promo settings saat ini ──────────────────────────────────
export async function GET(_req: Request, { params }: CtxParams): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const booth = await getOwnedBooth(params.id, session.user.id);
  if (!booth) return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });

  const prefs = parsePrefs(booth.welcomeScreenPrefs);
  return NextResponse.json({
    success: true,
    data: {
      promoBanners:      (prefs.promoBanners as { imageUrl: string }[]) ?? [],
      promoDelaySeconds: (prefs.promoIdleSeconds as number)            ?? 60,
      promoSlideSeconds: (prefs.promoSlideSeconds as number)            ?? 10,
    },
  });
}

// ── POST — upload satu banner baru ────────────────────────────────────────────
export async function POST(req: Request, { params }: CtxParams): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const booth = await getOwnedBooth(params.id, session.user.id);
  if (!booth) return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json<ApiResponse>({ success: false, error: "Request bukan multipart" }, { status: 400 }); }

  const file = formData.get("image");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Field 'image' diperlukan" }, { status: 400 });
  }

  // Validate type & size (max 5 MB)
  if (!file.type.startsWith("image/")) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Hanya file gambar yang diizinkan" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Ukuran file maksimal 5 MB" }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `promo-banners/${params.id}/${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const imageUrl = await uploadPhoto(key, buf, file.type);

  // Append to existing prefs
  const prefs = parsePrefs(booth.welcomeScreenPrefs);
  const banners = ((prefs.promoBanners as { imageUrl: string }[]) ?? []).concat({ imageUrl });

  await prisma.boothConfig.update({
    where: { id: params.id },
    data:  { welcomeScreenPrefs: { ...prefs, promoBanners: banners } as Prisma.InputJsonValue },
  });

  return NextResponse.json({ success: true, data: { imageUrl, promoBanners: banners } });
}

// ── PATCH — update timer settings ─────────────────────────────────────────────
const patchSchema = z.object({
  promoDelaySeconds: z.number().int().min(0).max(3600).optional(),
  promoSlideSeconds: z.number().int().min(1).max(3600).optional(),
});

export async function PATCH(req: Request, { params }: CtxParams): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const booth = await getOwnedBooth(params.id, session.user.id);
  if (!booth) return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Input tidak valid" }, { status: 400 });
  }

  const prefs = parsePrefs(booth.welcomeScreenPrefs);
  const updates: Record<string, unknown> = {};
  if (parsed.data.promoDelaySeconds !== undefined) updates.promoIdleSeconds  = parsed.data.promoDelaySeconds;
  if (parsed.data.promoSlideSeconds !== undefined) updates.promoSlideSeconds = parsed.data.promoSlideSeconds;

  await prisma.boothConfig.update({
    where: { id: params.id },
    data:  { welcomeScreenPrefs: { ...prefs, ...updates } as Prisma.InputJsonValue },
  });

  return NextResponse.json({ success: true });
}

// ── DELETE — hapus satu banner ────────────────────────────────────────────────
const deleteSchema = z.object({ imageUrl: z.string().min(1) });

export async function DELETE(req: Request, { params }: CtxParams): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const booth = await getOwnedBooth(params.id, session.user.id);
  if (!booth) return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>({ success: false, error: "imageUrl diperlukan" }, { status: 400 });
  }

  const { imageUrl } = parsed.data;
  // Hapus file dari storage
  const key = imageUrl.replace(/^\/uploads\//, "");
  await deletePhoto(key).catch(() => {});

  const prefs = parsePrefs(booth.welcomeScreenPrefs);
  const banners = ((prefs.promoBanners as { imageUrl: string }[]) ?? []).filter(b => b.imageUrl !== imageUrl);

  await prisma.boothConfig.update({
    where: { id: params.id },
    data:  { welcomeScreenPrefs: { ...prefs, promoBanners: banners } as Prisma.InputJsonValue },
  });

  return NextResponse.json({ success: true, data: { promoBanners: banners } });
}
