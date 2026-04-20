import type { Server as SocketServer } from "socket.io";

// ─────────────────────────────────────────────────────────────────────────────
// Socket.io global singleton accessor
//
// server.ts menyimpan instance io ke global.__io saat startup.
// API routes mengakses via getIO() untuk emit events.
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __io: SocketServer | undefined;
}

export function setIO(io: SocketServer): void {
  global.__io = io;
}

export function getIO(): SocketServer | null {
  return global.__io ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed event emitters — satu tempat untuk semua event names
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emit 'session:unlocked' ke semua booth UI yang ada di room booth:{boothConfigId}.
 * Dipanggil oleh webhook handler setelah pembayaran berhasil.
 */
export function emitSessionUnlocked(
  boothConfigId: string,
  payload: { sessionId: string; frameId: string | null; expiresAt: Date }
): void {
  const io = getIO();
  if (!io) {
    // Terjadi di dev tanpa custom server — log warning, jangan throw
    console.warn(
      `[socket] io belum diinisialisasi. Event session:unlocked untuk booth ${boothConfigId} tidak dikirim.`
    );
    return;
  }
  io.to(`booth:${boothConfigId}`).emit("session:unlocked", payload);
}

/**
 * Emit 'session:expired' saat QR / sesi timeout.
 */
export function emitSessionExpired(
  boothConfigId: string,
  sessionId: string
): void {
  const io = getIO();
  io?.to(`booth:${boothConfigId}`).emit("session:expired", { sessionId });
}
