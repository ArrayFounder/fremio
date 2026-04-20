"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

export interface SessionUnlockedPayload {
  sessionId: string;
  frameId:   string | null;
  expiresAt: string;
}

export interface UseBoothSocketOptions {
  onSessionUnlocked?: (payload: SessionUnlockedPayload) => void;
  onSessionExpired?:  (sessionId: string) => void;
}

/**
 * useBoothSocket — Socket.io client untuk Booth UI.
 * Join room booth:{boothConfigId} dan dengarkan event session:unlocked.
 * Disconnect otomatis saat unmount atau boothConfigId berubah.
 */
export function useBoothSocket(
  boothConfigId: string,
  { onSessionUnlocked, onSessionExpired }: UseBoothSocketOptions
) {
  const socketRef  = useRef<Socket | null>(null);
  const onUnlocked = useRef(onSessionUnlocked);
  const onExpired  = useRef(onSessionExpired);

  onUnlocked.current = onSessionUnlocked;
  onExpired.current  = onSessionExpired;

  useEffect(() => {
    const socket = io({
      path:       "/api/socket",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay:    2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("booth:join", boothConfigId);
    });

    socket.on("reconnect", () => {
      socket.emit("booth:join", boothConfigId);
    });

    socket.on("session:unlocked", (payload: SessionUnlockedPayload) => {
      onUnlocked.current?.(payload);
    });

    socket.on("session:expired", ({ sessionId }: { sessionId: string }) => {
      onExpired.current?.(sessionId);
    });

    return () => {
      socket.emit("booth:leave", boothConfigId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [boothConfigId]);
}
