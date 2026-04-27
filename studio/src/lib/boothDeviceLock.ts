type BoothDeviceLockEntry = {
  deviceId: string;
  lastSeenAt: number;
};

type BoothDeviceLockStore = Map<string, BoothDeviceLockEntry>;

const LOCK_TTL_MS = 25_000;

function getStore(): BoothDeviceLockStore {
  const g = globalThis as typeof globalThis & { __boothDeviceLockStore?: BoothDeviceLockStore };
  if (!g.__boothDeviceLockStore) {
    g.__boothDeviceLockStore = new Map<string, BoothDeviceLockEntry>();
  }
  return g.__boothDeviceLockStore;
}

function isExpired(entry: BoothDeviceLockEntry, now: number): boolean {
  return now - entry.lastSeenAt > LOCK_TTL_MS;
}

export function acquireBoothDeviceLock(slug: string, deviceId: string): { granted: boolean; activeDeviceId: string | null } {
  const store = getStore();
  const now = Date.now();
  const existing = store.get(slug);

  if (existing && isExpired(existing, now)) {
    store.delete(slug);
  }

  const current = store.get(slug);
  if (!current || current.deviceId === deviceId) {
    store.set(slug, { deviceId, lastSeenAt: now });
    return { granted: true, activeDeviceId: deviceId };
  }

  return { granted: false, activeDeviceId: current.deviceId };
}

export function heartbeatBoothDeviceLock(slug: string, deviceId: string): { granted: boolean; activeDeviceId: string | null } {
  const store = getStore();
  const now = Date.now();
  const existing = store.get(slug);

  if (!existing || isExpired(existing, now)) {
    store.set(slug, { deviceId, lastSeenAt: now });
    return { granted: true, activeDeviceId: deviceId };
  }

  if (existing.deviceId === deviceId) {
    store.set(slug, { ...existing, lastSeenAt: now });
    return { granted: true, activeDeviceId: deviceId };
  }

  return { granted: false, activeDeviceId: existing.deviceId };
}

export function releaseBoothDeviceLock(slug: string, deviceId: string): { released: boolean } {
  const store = getStore();
  const existing = store.get(slug);
  if (!existing) return { released: false };
  if (existing.deviceId !== deviceId) return { released: false };
  store.delete(slug);
  return { released: true };
}
