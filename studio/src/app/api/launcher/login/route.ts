import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

interface LauncherLoginResponse {
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

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<LauncherLoginResponse>(
        { success: false, error: "Email atau password tidak valid." },
        { status: 422 }
      );
    }

    const operator = await prisma.operator.findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        email: true,
        businessName: true,
        isActive: true,
      },
    });

    if (!operator || !operator.isActive) {
      return NextResponse.json<LauncherLoginResponse>(
        { success: false, error: "Email atau password salah." },
        { status: 401 }
      );
    }

    const operatorWithPassword = await prisma.operator.findUnique({
      where: { id: operator.id },
      select: { password: true },
    });

    if (!operatorWithPassword) {
      return NextResponse.json<LauncherLoginResponse>(
        { success: false, error: "Email atau password salah." },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(parsed.data.password, operatorWithPassword.password);
    if (!isValid) {
      return NextResponse.json<LauncherLoginResponse>(
        { success: false, error: "Email atau password salah." },
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

    return NextResponse.json<LauncherLoginResponse>({
      success: true,
      data: {
        operator: {
          id: operator.id,
          email: operator.email,
          businessName: operator.businessName,
        },
        booths: booths.map((b) => ({
          id: b.id,
          boothName: b.boothName,
          slug: b.slug,
          boothUrl: `${boothBaseUrl}/b/${b.slug}`,
        })),
      },
    });
  } catch {
    return NextResponse.json<LauncherLoginResponse>(
      { success: false, error: "Gagal login launcher. Coba lagi." },
      { status: 500 }
    );
  }
}
