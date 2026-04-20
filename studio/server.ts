// ─────────────────────────────────────────────────────────────────────────────
// Custom Next.js Server — menggabungkan Next.js + Socket.io dalam satu proses
//
// Jalankan dengan: ts-node --project tsconfig.server.json server.ts
// atau: npx tsx server.ts
//
// Socket.io berjalan di path /api/socket sehingga tidak konflik dengan
// Next.js API routes yang lain.
// ─────────────────────────────────────────────────────────────────────────────

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketServer } from "socket.io";
import { setIO } from "./src/lib/socket";

const dev      = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port     = parseInt(process.env.PORT ?? "3000", 10);

const app    = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true);
    await handle(req, res, parsedUrl);
  });

  // ── Socket.io setup ─────────────────────────────────────────────────────────
  const io = new SocketServer(httpServer, {
    path: "/api/socket",
    cors: {
      // Izinkan dari domain studio dan localhost saja
      origin: [
        "http://localhost:3000",
        "https://localhost:3000",
        process.env.NEXT_PUBLIC_APP_URL ?? "",
      ].filter(Boolean),
      methods: ["GET", "POST"],
    },
    // Aktifkan transport websocket + polling fallback
    transports: ["websocket", "polling"],
  });

  // Store io instance ke global supaya bisa diakses dari API routes
  setIO(io);

  // ── Socket.io event handlers ────────────────────────────────────────────────
  io.on("connection", (socket) => {
    // Booth UI join room saat mount, room name = booth:{boothConfigId}
    socket.on("booth:join", (boothConfigId: string) => {
      if (typeof boothConfigId === "string" && boothConfigId.length < 100) {
        socket.join(`booth:${boothConfigId}`);
        socket.emit("booth:joined", { boothConfigId });
      }
    });

    socket.on("booth:leave", (boothConfigId: string) => {
      socket.leave(`booth:${boothConfigId}`);
    });

    socket.on("disconnect", () => {});
  });

  // ── Start ───────────────────────────────────────────────────────────────────
  httpServer.listen(port, hostname, () => {
    console.log(`✅ Fremio Studio ready → http://${hostname}:${port}`);
  });
});
