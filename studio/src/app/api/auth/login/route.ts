import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { signIn } from "next-auth/react";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

interface LoginResponse {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    email: string;
    businessName: string;
    subscriptionTier: string;
  };
  token?: string;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));

    // Validate input
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json<LoginResponse>(
        { success: false, error: "Email atau password tidak valid." },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    // Find operator
    const operator = await prisma.operator.findUnique({
      where: { email },
    });

    if (!operator || !operator.isActive) {
      return NextResponse.json<LoginResponse>(
        { success: false, error: "Email atau password salah." },
        { status: 401 }
      );
    }

    // Check password exists
    if (!operator.password) {
      return NextResponse.json<LoginResponse>(
        { success: false, error: "Akun ini tidak mendukung login password. Gunakan Google Sign-in." },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, operator.password);
    if (!isValid) {
      return NextResponse.json<LoginResponse>(
        { success: false, error: "Email atau password salah." },
        { status: 401 }
      );
    }

    // Return user data (client will handle session)
    return NextResponse.json<LoginResponse>({
      success: true,
      user: {
        id: operator.id,
        email: operator.email,
        businessName: operator.businessName,
        subscriptionTier: operator.subscriptionTier,
      },
    });
  } catch (error) {
    console.error("[auth/login] Error:", error);
    return NextResponse.json<LoginResponse>(
      { success: false, error: "Terjadi kesalahan server. Coba lagi nanti." },
      { status: 500 }
    );
  }
}