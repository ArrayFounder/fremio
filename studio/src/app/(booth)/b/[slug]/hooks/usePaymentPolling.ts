"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface UsePaymentPollingOptions {
  intervalMs?: number;
}

/**
 * usePaymentPolling — poll GET /api/payment/status/[orderId] setiap intervalMs.
 * Berhenti saat status menjadi SUCCESS, FAILED, CANCELLED, atau EXPIRED.
 */
export function usePaymentPolling(
  orderId: string | null,
  onSuccess: (sessionId: string) => void,
  onFailed:  () => void,
  { intervalMs = 3000 }: UsePaymentPollingOptions = {}
) {
  const [isPolling, setIsPolling]     = useState(false);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef   = useRef(true);
  const onSuccessRef = useRef(onSuccess);
  const onFailedRef  = useRef(onFailed);

  // Selalu pakai versi terbaru callback tanpa re-start polling
  onSuccessRef.current = onSuccess;
  onFailedRef.current  = onFailed;

  const stopPolling = useCallback(() => {
    stoppedRef.current = true;
    setIsPolling(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!orderId) return;

    stoppedRef.current = false;
    setIsPolling(true);

    const poll = async () => {
      if (stoppedRef.current) return;
      try {
        const res  = await fetch(`/api/payment/status/${encodeURIComponent(orderId)}`);
        if (!res.ok) return;
        const body = await res.json() as { success: boolean; data?: { status: string; sessionId?: string } };
        if (!body.success || !body.data) return;

        const { status, sessionId } = body.data;
        if (status === "SUCCESS" && sessionId) {
          stopPolling();
          onSuccessRef.current(sessionId);
        } else if (["FAILED", "CANCELLED", "EXPIRED"].includes(status)) {
          stopPolling();
          onFailedRef.current();
        }
      } catch {
        // Network error — lanjutkan polling
      }
    };

    // Poll segera, lalu berkala
    poll();
    timerRef.current = setInterval(poll, intervalMs);

    return stopPolling;
  }, [orderId, intervalMs, stopPolling]);

  return { isPolling, stopPolling };
}
