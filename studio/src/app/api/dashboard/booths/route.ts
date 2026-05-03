import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TIER_LIMITS } from "@/types";
import type { ApiResponse } from "@/types";

// ─── Validation ───────────────────────────────────────────────────────────────

const createSchema = z.object({
  boothName:             z.string().min(2, "Nama booth minimal 2 karakter").trim(),
  slug:                  z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, "Hanya huruf kecil, angka, dan tanda hubung"),
  pricePerSession:       z.number().int().min(1000, "Harga minimal Rp 1.000"),
  printPricePerSheet:    z.number().int().min(0).default(10000),
  sessionDurationSeconds: z.number().int().min(60).max(1800).default(300),
  printEnabled:          z.boolean().default(false),
  primaryColor:          z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  accentColor:           z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#deb7a9"),
});

// ─── GET /api/dashboard/booths ────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const booths = await prisma.boothConfig.findMany({
    where:   { operatorId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: { sessions: { where: { status: "COMPLETED" } } },
      },
    },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: booths });
}

// ─── POST /api/dashboard/booths ───────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  // Cek limit booth berdasarkan jumlah kredit (credit-based)
  const operator = await prisma.operator.findUnique({
    where:  { id: session.user.id },
    select: { credits: true },
  });
  if (!operator) return NextResponse.json<ApiResponse>({ success: false, error: "Operator tidak ditemukan" }, { status: 404 });

  // 1 booth gratis (trial), selanjutnya butuh kredit
  const currentCount = await prisma.boothConfig.count({ where: { operatorId: session.user.id } });
  const hasFreeSlot = currentCount < 1;
  const hasCredits  = operator.credits > 0;

  if (!hasFreeSlot && !hasCredits) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Booth gratis sudah terpakai. Beli kredit di halaman pricing untuk menambah booth." },
      { status: 403 }
    );
  }

  // Cek slug unik
  const existing = await prisma.boothConfig.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Slug sudah dipakai, coba yang lain" }, { status: 409 });
  }

  // Ambil semua frame aktif (termasuk imported dari fremio.id) untuk dijadikan default library
  const allActiveFrames = await prisma.frame.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { sortOrder: "asc" },
  });
  const defaultFrameIds = allActiveFrames.map((f) => f.id);

  const booth = await prisma.boothConfig.create({
    data: {
      ...parsed.data,
      operatorId: session.user.id,
      allowedFrameIds: defaultFrameIds,
    },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: booth }, { status: 201 });
}
