/**
 * Share Plus Subscription Service
 * Handles API calls for Membership Plus (Fremio Share quota tiers)
 */

import api from "./api";

export const SHARE_PLUS_PLAN_LABELS = {
  starter: "Starter",
  pro: "Pro",
  max: "Max",
};

const shareSubscriptionService = {
  /**
   * Get available plans (public)
   */
  async getPlans() {
    try {
      return await api.get("/share-subscription/plans", false);
    } catch {
      return null;
    }
  },

  /**
   * Get current user's active share+ subscription
   */
  async getStatus() {
    try {
      return await api.get("/share-subscription/status");
    } catch {
      return null;
    }
  },

  /**
   * Create a Midtrans payment transaction for a Share Plus tier
   * @param {{ tier: string, name?: string, phone?: string }} params
   */
  async createSubscription(params) {
    return api.post("/share-subscription/create", params);
  },
};

export default shareSubscriptionService;
