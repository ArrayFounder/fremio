import type { BoothScreen, FrameData, PaymentMethod } from "./types";

const STORAGE_PREFIX = "fremio_booth_recovery_v1";
const RETENTION_MS = 24 * 60 * 60 * 1000;

export interface RecoverySnapshot {
  sessionId: string;
  orderId: string | null;
  boothSlug: string;
  frame: FrameData;
  amount: number;
  printCount: number;
  paymentMethod: PaymentMethod | null;
  sourceScreen: BoothScreen;
  createdAt: string;
  updatedAt: string;
  logResumeUsedAt?: string | null;
}

function getStorageKey(boothSlug: string): string {
  return `${STORAGE_PREFIX}_${boothSlug}`;
}

function isStorageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

function readAll(boothSlug: string): Record<string, RecoverySnapshot> {
  if (!isStorageAvailable()) return {};
  try {
    const raw = localStorage.getItem(getStorageKey(boothSlug));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, RecoverySnapshot>;
  } catch {
    return {};
  }
}

function writeAll(boothSlug: string, snapshots: Record<string, RecoverySnapshot>): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(getStorageKey(boothSlug), JSON.stringify(snapshots));
  } catch {
    // Ignore quota/storage failures so booth flow never crashes.
  }
}

export function cleanupRecoverySnapshots(boothSlug: string): void {
  const now = Date.now();
  const snapshots = readAll(boothSlug);
  const filtered = Object.fromEntries(
    Object.entries(snapshots).filter(([, snapshot]) => {
      const reference = Date.parse(snapshot.updatedAt || snapshot.createdAt);
      return Number.isFinite(reference) && now - reference < RETENTION_MS;
    })
  );
  writeAll(boothSlug, filtered);
}

export function saveRecoverySnapshot(snapshot: RecoverySnapshot): void {
  cleanupRecoverySnapshots(snapshot.boothSlug);
  const snapshots = readAll(snapshot.boothSlug);
  snapshots[snapshot.sessionId] = snapshot;
  writeAll(snapshot.boothSlug, snapshots);
}

export function getRecoverySnapshot(boothSlug: string, sessionId: string): RecoverySnapshot | null {
  cleanupRecoverySnapshots(boothSlug);
  return readAll(boothSlug)[sessionId] ?? null;
}

export function listRecoverySnapshots(boothSlug: string): RecoverySnapshot[] {
  cleanupRecoverySnapshots(boothSlug);
  return Object.values(readAll(boothSlug)).sort((left, right) =>
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
}

export function removeRecoverySnapshot(boothSlug: string, sessionId: string): void {
  const snapshots = readAll(boothSlug);
  if (!snapshots[sessionId]) return;
  delete snapshots[sessionId];
  writeAll(boothSlug, snapshots);
}

export function markLogResumeUsed(boothSlug: string, sessionId: string): RecoverySnapshot | null {
  const snapshots = readAll(boothSlug);
  const snapshot = snapshots[sessionId];
  if (!snapshot) return null;
  const updated: RecoverySnapshot = {
    ...snapshot,
    logResumeUsedAt: snapshot.logResumeUsedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  snapshots[sessionId] = updated;
  writeAll(boothSlug, snapshots);
  return updated;
}