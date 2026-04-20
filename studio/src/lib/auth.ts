import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

// ─────────────────────────────────────────────────────────────────────────────
// NextAuth Configuration
// Strategy: JWT (tidak perlu tabel Session di DB)
// Provider: Credentials (email + password)
// ─────────────────────────────────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 hari
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // 1. Validate input dengan Zod
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // 2. Cari operator di database
        const operator = await prisma.operator.findUnique({
          where: { email: parsed.data.email },
        });

        // Return null tanpa memberi tahu field mana yang salah (security)
        if (!operator || !operator.isActive) return null;

        // 3. Verifikasi password
        const isValid = await bcrypt.compare(
          parsed.data.password,
          operator.password
        );
        if (!isValid) return null;

        // 4. Return user object — akan di-encode ke JWT
        return {
          id:                 operator.id,
          email:              operator.email,
          name:               operator.businessName,
          businessName:       operator.businessName,
          subscriptionTier:   operator.subscriptionTier,
          subscriptionStatus: null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Saat pertama login, user object tersedia
      if (user) {
        token.id               = user.id;
        token.businessName     = (user as any).businessName;
        token.subscriptionTier = (user as any).subscriptionTier;
        token.subscriptionStatus = (user as any).subscriptionStatus;
      }
      return token;
    },
    async session({ session, token }) {
      // Inject data dari JWT ke session yang dikembalikan ke client
      if (token && session.user) {
        session.user.id               = token.id as string;
        session.user.businessName     = token.businessName;
        session.user.subscriptionTier = token.subscriptionTier;
        session.user.subscriptionStatus = token.subscriptionStatus as any;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
