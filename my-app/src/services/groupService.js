const getApiUrl = () => {
  return import.meta.env.VITE_API_URL || "/api";
};

const GROUP_SHARE_ANALYTICS_SESSION_KEY = "__fremio_group_share_analytics_session__";
const DEVICE_ID_KEY = "fremio_device_id";

const getGroupShareSessionId = () => {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.sessionStorage.getItem(GROUP_SHARE_ANALYTICS_SESSION_KEY);
    if (existing) return existing;

    const next = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `grp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    window.sessionStorage.setItem(GROUP_SHARE_ANALYTICS_SESSION_KEY, next);
    return next;
  } catch {
    return null;
  }
};

/** Persistent device fingerprint stored in localStorage. */
const getOrCreateDeviceId = () => {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 8) return existing;

    const next = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

    window.localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return null;
  }
};

export async function getSharedGroup(shareId) {
  const API_URL = getApiUrl();
  const deviceId = getOrCreateDeviceId();
  const headers = {};
  if (deviceId) headers["x-device-id"] = deviceId;
  const response = await fetch(`${API_URL}/groups/share/${shareId}`, { headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || "Group not found");
  }
  const data = await response.json();
  return data.group;
}

export async function trackGroupShareEvent(shareId, eventType, metadata = {}) {
  if (!shareId || !eventType) return { success: false };

  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/groups/share/${encodeURIComponent(shareId)}/analytics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      eventType,
      sessionId: getGroupShareSessionId(),
      metadata,
    }),
    keepalive: true,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || err?.error || "Failed to track group share event");
  }

  return response.json().catch(() => ({ success: true }));
}

export async function fetchGroupShareAnalytics(shareId, token, options = {}) {
  if (!shareId) {
    throw new Error("shareId is required");
  }

  const API_URL = getApiUrl();
  const params = new URLSearchParams();
  if (options?.days) {
    params.set("days", String(options.days));
  }

  const response = await fetch(
    `${API_URL}/groups/public-share/${encodeURIComponent(shareId)}/analytics${params.toString() ? `?${params.toString()}` : ""}`,
    {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || err?.error || "Failed to fetch group analytics");
  }

  const data = await response.json();
  return data.analytics;
}

export async function fetchGroupShareQuota(token) {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/groups/share-quota`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || err?.error || "Failed to fetch share quota");
  }

  const data = await response.json();
  return data.quota;
}
