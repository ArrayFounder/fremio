import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

const TRIAL_ONLY_MODE = true;

// ─────────────────────────────────────────────────────────────────────────────
// NextAuth Configuration
// Strategy: JWT (tidak perlu tabel Session di DB)
// Provider: Credentials (email + password) + Google OAuth
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

        // 3. Verifikasi password — OAuth user tanpa password tidak bisa login via credentials
        if (!operator.password) return null;
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
          subscriptionStatus: TRIAL_ONLY_MODE ? "TRIAL" : null,
        };
      },
    }),
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // Auto-create/link Operator saat Google OAuth sign-in
      if (account?.provider === "google" && profile?.email) {
        const email = (profile.email as string).toLowerCase().trim();
        const name = (profile.name as string) || email.split("@")[0];

        const existing = await prisma.operator.findUnique({ where: { email } });
        if (!existing) {
          const trialExpiry = new Date();
          trialExpiry.setDate(trialExpiry.getDate() + 30);
          await prisma.operator.create({
            data: {
              email,
              businessName: name,
              password: null,
              isActive: true,
              subscriptionExpiry: trialExpiry,
            },
          });
        } else if (!existing.isActive) {
          return false; // Akun dinonaktifkan
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // Saat pertama login, user object tersedia
      if (user) {
        token.id               = user.id;
        token.businessName     = (user as any).businessName;
        token.subscriptionTier = (user as any).subscriptionTier;
        token.subscriptionStatus = (user as any).subscriptionStatus;
      }
      // Untuk Google OAuth, ambil data operator dari DB supaya tetap sinkron
      if (account?.provider === "google" && token.email) {
        const operator = await prisma.operator.findUnique({
          where: { email: token.email.toLowerCase().trim() },
        });
        if (operator) {
          token.id                 = operator.id;
          token.businessName       = operator.businessName;
          token.subscriptionTier   = operator.subscriptionTier;
          token.subscriptionStatus = TRIAL_ONLY_MODE ? "TRIAL" : null;
        }
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
