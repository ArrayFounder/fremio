import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface LauncherSessionResponse {
  success: boolean;
  error?: string;
  data?: {
    operator: {
      id: string;
      email: string;
      businessName: string;
    };
    booths: Array<{
      id: string;
      boothName: string;
      slug: string;
      boothUrl: string;
    }>;
  };
}

export async function GET(): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;

    if (!sessionUser?.id && !sessionUser?.email) {
      return NextResponse.json<LauncherSessionResponse>(
        { success: false, error: "Belum login." },
        { status: 401 }
      );
    }

    const operator = await prisma.operator.findFirst({
      where: {
        isActive: true,
        OR: [
          sessionUser.id ? { id: sessionUser.id } : undefined,
          sessionUser.email ? { email: sessionUser.email.toLowerCase().trim() } : undefined,
        ].filter(Boolean) as Array<{ id: string } | { email: string }>,
      },
      select: {
        id: true,
        email: true,
        businessName: true,
      },
    });

    if (!operator) {
      return NextResponse.json<LauncherSessionResponse>(
        { success: false, error: "Akun tidak ditemukan atau tidak aktif." },
        { status: 401 }
      );
    }

    const booths = await prisma.boothConfig.findMany({
      where: {
        operatorId: operator.id,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        boothName: true,
        slug: true,
      },
    });

    const boothBaseUrl = "https://studio.fremio.id";

    return NextResponse.json<LauncherSessionResponse>({
      success: true,
      data: {
        operator: {
          id: operator.id,
          email: operator.email,
          businessName: operator.businessName,
        },
        booths: booths.map((booth) => ({
          id: booth.id,
          boothName: booth.boothName,
          slug: booth.slug,
          boothUrl: `${boothBaseUrl}/b/${booth.slug}`,
        })),
      },
    });
  } catch {
    return NextResponse.json<LauncherSessionResponse>(
      { success: false, error: "Gagal membaca sesi launcher." },
      { status: 500 }
    );
  }
}
