import "next-auth";
import type { SubscriptionTier } from "@prisma/client";

// SubscriptionStatus tidak ada di schema aktif — definisikan lokal
type SubscriptionStatus = "TRIAL" | "ACTIVE" | "EXPIRED" | "CANCELLED";

// ─────────────────────────────────────────────────────────────────────────────
// Module augmentation — extend NextAuth types dengan field custom
// ─────────────────────────────────────────────────────────────────────────────

declare module "next-auth" {
  interface User {
    id:                 string;
    businessName:       string;
    subscriptionTier:   SubscriptionTier | null;
    subscriptionStatus: SubscriptionStatus | null;
  }

  interface Session {
    user: User & {
      email: string;
      name:  string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id:                 string;
    businessName:       string;
    subscriptionTier:   SubscriptionTier | null;
    subscriptionStatus: SubscriptionStatus | null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// App-wide shared types
// ─────────────────────────────────────────────────────────────────────────────

/** Response standar API routes */
export type ApiResponse<T = unknown> =
  | { success: true;  data: T }
  | { success: false; error: string; details?: unknown };

/** Subscription tier limits */
export const TIER_LIMITS: Record<SubscriptionTier, { maxBooths: number; priceIdr: number }> = {
  STARTER:    { maxBooths: 3,         priceIdr: 299_000 },
  PRO:        { maxBooths: 10,        priceIdr: 699_000 },
  ENTERPRISE: { maxBooths: Infinity,  priceIdr: 0 },       // custom pricing
};

/** Durasi subscription dalam hari */
export const SUBSCRIPTION_DURATION_DAYS = 30;
