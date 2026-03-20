import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
import { initializeFirebase } from "./config/firebase.js";
import storageService from "./services/storageService.js";
import { WebSocketServer } from "ws";

// Routes
import authRoutes from "./routes/auth.js";
import framesRoutes from "./routes/frames.js";
import draftsRoutes from "./routes/drafts-pg.js"; // Use PostgreSQL version
import groupsRoutes from "./routes/groups-pg.js";
import uploadRoutes from "./routes/upload.js";
import analyticsRoutes from "./routes/analytics.js";
import staticRoutes from "./routes/static.js";
import paymentRoutes from "./routes/payment.js";
import maintenanceRoutes from "./routes/maintenance.js";
import webrtcRoutes from "./routes/webrtc.js";
import adminSubscribersRoutes from "./routes/adminSubscribers.js";
import usersRoutes from "./routes/users.js";
import designerRoutes from "./routes/designer.js";
import { startAutoReconcilePendingService } from "./services/autoReconcilePendingService.js";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

// ------------------------------
// TakeMoment Friends Realtime (WebSocket)
// ------------------------------

const wsSafeSend = (ws, message) => {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Ignore send errors (e.g., connection already closing)
  }
};

const wsBroadcast = (clients, message, exceptClientId = null) => {
  for (const [clientId, client] of clients.entries()) {
    if (exceptClientId && clientId === exceptClientId) continue;
    wsSafeSend(client.ws, message);
  }
};

const generateId = () => {
  // URL-safe id, good enough for ephemeral room/client IDs
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

const takeMomentRooms = new Map();

const getOrCreateRoom = (roomId) => {
  const existing = takeMomentRooms.get(roomId);
  if (existing) return existing;

  const room = {
    roomId,
    masterId: null,
    createdAt: Date.now(),
    state: {
      background: "#F4E6DA",
      layoutUnits: "px",
      layout: {},
    },
    clients: new Map(), // clientId -> { ws, role }
  };
  takeMomentRooms.set(roomId, room);
  return room;
};

const cleanupRoomIfEmpty = (roomId) => {
  const room = takeMomentRooms.get(roomId);
  if (!room) return;
  if (room.clients.size === 0) {
    takeMomentRooms.delete(roomId);
  }
};

const attachTakeMomentWs = (server) => {
  const wss = new WebSocketServer({ server, path: "/ws/take-moment" });

  wss.on("connection", (ws) => {
    const connection = {
      roomId: null,
      clientId: null,
      role: null,
    };

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw || ""));
      } catch {
        wsSafeSend(ws, { type: "ERROR", payload: { message: "Invalid JSON" } });
        return;
      }

      const { type, payload } = msg || {};
      if (!type) {
        wsSafeSend(ws, { type: "ERROR", payload: { message: "Missing type" } });
        return;
      }

      if (type === "CREATE_ROOM") {
        const roomId = payload?.roomId || generateId();
        getOrCreateRoom(roomId);
        wsSafeSend(ws, { type: "ROOM_CREATED", payload: { roomId } });
        return;
      }

      if (type === "JOIN") {
        const roomId = String(payload?.roomId || "").trim();
        if (!roomId) {
          wsSafeSend(ws, {
            type: "ERROR",
            payload: { message: "Missing roomId" },
          });
          return;
        }

        const room = getOrCreateRoom(roomId);
        if (room.clients.size >= 4) {
          wsSafeSend(ws, {
            type: "ERROR",
            payload: { message: "Room penuh (maks 4 orang)" },
          });
          return;
        }

        const clientId = payload?.clientId
          ? String(payload.clientId)
          : generateId();
        const isFirst = !room.masterId;
        const role = isFirst ? "master" : "participant";

        connection.roomId = roomId;
        connection.clientId = clientId;
        connection.role = role;

        room.clients.set(clientId, { ws, role });
        if (isFirst) {
          room.masterId = clientId;
        }

        // Initialize default layout slot for new user if missing
        if (!room.state.layout[clientId]) {
          const index = Math.max(0, room.clients.size - 1);
          room.state.layout[clientId] = {
            x: 40 + index * 40,
            y: 40 + index * 40,
            w: 220,
            h: 220,
            z: index,
          };
        }

        const peers = [...room.clients.keys()].filter((id) => id !== clientId);
        wsSafeSend(ws, {
          type: "WELCOME",
          payload: {
            roomId,
            clientId,
            role,
            peers,
            state: room.state,
            masterId: room.masterId,
          },
        });

        wsBroadcast(
          room.clients,
          {
            type: "PEER_JOINED",
            payload: {
              clientId,
              role,
              state: room.state,
              masterId: room.masterId,
            },
          },
          clientId,
        );
        return;
      }

      // Everything below requires a joined room
      if (!connection.roomId || !connection.clientId) {
        wsSafeSend(ws, { type: "ERROR", payload: { message: "Not joined" } });
        return;
      }

      const room = takeMomentRooms.get(connection.roomId);
      if (!room) {
        wsSafeSend(ws, {
          type: "ERROR",
          payload: { message: "Room not found" },
        });
        return;
      }

      if (type === "SIGNAL") {
        const to = String(payload?.to || "").trim();
        const data = payload?.data;
        const target = room.clients.get(to);
        if (!target) return;

        wsSafeSend(target.ws, {
          type: "SIGNAL",
          payload: {
            from: connection.clientId,
            data,
          },
        });
        return;
      }

      if (type === "STATE_UPDATE") {
        if (connection.role !== "master") {
          wsSafeSend(ws, {
            type: "ERROR",
            payload: { message: "Only master can update state" },
          });
          return;
        }

        const nextState = payload?.state;
        if (!nextState || typeof nextState !== "object") {
          wsSafeSend(ws, {
            type: "ERROR",
            payload: { message: "Invalid state" },
          });
          return;
        }

        // Whitelist allowed fields
        if (typeof nextState.background === "string") {
          room.state.background = nextState.background;
        }
        if (
          nextState.layoutUnits === "norm" ||
          nextState.layoutUnits === "px"
        ) {
          room.state.layoutUnits = nextState.layoutUnits;
        }
        if (nextState.layout && typeof nextState.layout === "object") {
          room.state.layout = nextState.layout;
        }

        wsBroadcast(room.clients, {
          type: "STATE",
          payload: { state: room.state, masterId: room.masterId },
        });
        return;
      }

      if (type === "END_SESSION") {
        if (connection.role !== "master") {
          wsSafeSend(ws, {
            type: "ERROR",
            payload: { message: "Only master can end session" },
          });
          return;
        }

        wsBroadcast(room.clients, {
          type: "SESSION_ENDED",
          payload: { reason: payload?.reason || "ended" },
        });
        return;
      }

      if (type === "ROOM_EVENT") {
        if (connection.role !== "master") {
          wsSafeSend(ws, {
            type: "ERROR",
            payload: { message: "Only master can send room events" },
          });
          return;
        }

        const kind = typeof payload?.kind === "string" ? payload.kind : "";
        if (!kind) {
          wsSafeSend(ws, {
            type: "ERROR",
            payload: { message: "Invalid room event" },
          });
          return;
        }

        wsBroadcast(
          room.clients,
          {
            type: "ROOM_EVENT",
            payload: {
              ...payload,
              from: connection.clientId,
              masterId: room.masterId,
            },
          },
          connection.clientId,
        );
        return;
      }

      wsSafeSend(ws, {
        type: "ERROR",
        payload: { message: `Unknown type: ${type}` },
      });
    });

    ws.on("close", () => {
      const roomId = connection.roomId;
      const clientId = connection.clientId;
      if (!roomId || !clientId) return;

      const room = takeMomentRooms.get(roomId);
      if (!room) return;

      room.clients.delete(clientId);

      // If master leaves, end session for everybody (simplest, avoids orphaned rooms)
      if (room.masterId === clientId) {
        wsBroadcast(room.clients, {
          type: "SESSION_ENDED",
          payload: { reason: "master_disconnected" },
        });
        room.clients.clear();
        takeMomentRooms.delete(roomId);
        return;
      }

      wsBroadcast(room.clients, {
        type: "PEER_LEFT",
        payload: { clientId },
      });

      cleanupRoomIfEmpty(roomId);
    });
  });
};

// CRITICAL: Trust proxy for nginx reverse proxy
// This allows express-rate-limit to see real client IPs from X-Forwarded-For
app.set("trust proxy", 1);

// Rate limiting configuration
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 500 : 1000, // Increased limit: 500 in prod, 1000 in dev
  message: {
    success: false,
    message: "Terlalu banyak permintaan, coba lagi dalam 15 menit",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use real client IP from X-Forwarded-For header (nginx sets this)
  keyGenerator: (req) => {
    return (
      req.ip ||
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.connection.remoteAddress
    );
  },
  // Skip rate limiting for OPTIONS preflight requests
  skip: (req) => req.method === "OPTIONS",
});

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 50 : 100, // Limit login attempts
  message: {
    success: false,
    message: "Terlalu banyak percobaan login, coba lagi dalam 15 menit",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
});

// Upload rate limit
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProduction ? 100 : 200, // Limit uploads per hour
  message: {
    success: false,
    message: "Terlalu banyak upload, coba lagi dalam 1 jam",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
});

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Disable CSP for development
  }),
);
app.use(compression());
app.use(
  morgan(isProduction ? "combined" : "dev", {
    skip: (req) => {
      const p = req.path || "";
      return (
        p.startsWith("/api/analytics") ||
        p.startsWith("/uploads") ||
        p === "/api/maintenance/status"
      );
    },
  }),
);

// CORS - Allow all origins for static files and API
app.use(
  cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// CRITICAL: Handle OPTIONS preflight before any other middleware
app.options(
  "*",
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  }),
);

// Apply general rate limiting
app.use(generalLimiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static files from public directory
const publicDir = process.env.STATIC_DIR || path.join(__dirname, "public");
app.use(
  "/static",
  express.static(publicDir, {
    maxAge: "1y",
    immutable: true,
    setHeaders: (res, filePath) => {
      // Ensure correct MIME types for WebAssembly and MediaPipe assets.
      // If `.wasm` is served with the wrong Content-Type, browsers fall back to slower
      // compilation and MediaPipe init can take 30s+ on some networks/devices.
      if (filePath.endsWith(".wasm")) {
        res.setHeader("Content-Type", "application/wasm");
      } else if (filePath.endsWith(".tflite")) {
        res.setHeader("Content-Type", "application/octet-stream");
      } else if (filePath.endsWith(".binarypb")) {
        res.setHeader("Content-Type", "application/octet-stream");
      } else if (filePath.endsWith(".data")) {
        res.setHeader("Content-Type", "application/octet-stream");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);

// Serve mock-frames (alias to public/mock-frames)
app.use(
  "/mock-frames",
  express.static(path.join(publicDir, "mock-frames"), {
    maxAge: "1y",
    immutable: true,
  }),
);

// Serve uploaded files (frames, thumbnails)
const uploadsDir = path.join(__dirname, "uploads");
app.use(
  "/uploads",
  express.static(uploadsDir, {
    maxAge: "30d",
    etag: true,
  }),
);

// Serve public assets (images, icons, etc.)
app.use(
  "/assets",
  express.static(path.join(__dirname, "public", "assets"), {
    maxAge: "1y",
    etag: true,
  }),
);

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Fremio Backend API is running",
    timestamp: new Date().toISOString(),
    environment: isProduction ? "production" : "development",
  });
});

// Legacy health check (for compatibility)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", port: PORT, timestamp: new Date().toISOString() });
});

// API Routes - Apply specific rate limiters
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/frames", framesRoutes);
app.use("/api/drafts", draftsRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/upload", uploadLimiter, uploadRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/webrtc", webrtcRoutes);
app.use("/api/static", staticRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/admin/subscribers", adminSubscribersRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/designer", designerRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Initialize Firebase and start server
const startServer = async () => {
  try {
    // Initialize Firebase Admin
    await initializeFirebase();

    // Optional: auto-reconcile pending payments (helps when webhooks/redirects are flaky)
    startAutoReconcilePendingService();

    // Start cleanup cron for temp files (every 6 hours)
    setInterval(
      () => {
        const hours = parseInt(process.env.TEMP_FILE_CLEANUP_HOURS) || 24;
        storageService.cleanupTempFiles(hours);
      },
      6 * 60 * 60 * 1000,
    );

    // Check for HTTPS certificates.
    // IMPORTANT: when running behind nginx (production), the backend should
    // listen on HTTP; nginx terminates TLS. To avoid accidental HTTP/HTTPS
    // mismatch causing 502, only start HTTPS when explicitly enabled.
    const certPath = path.join(__dirname, "localhost+3.pem");
    const keyPath = path.join(__dirname, "localhost+3-key.pem");
    const enableHttps =
      String(process.env.ENABLE_HTTPS || "").toLowerCase() === "true";
    const useHttps =
      enableHttps && fs.existsSync(certPath) && fs.existsSync(keyPath);

    let server;
    if (useHttps) {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
      server = https.createServer(httpsOptions, app);
    } else {
      server = http.createServer(app);
    }

    attachTakeMomentWs(server);

    server.listen(PORT, "0.0.0.0", () => {
      console.log("");
      console.log(
        useHttps
          ? "🔒 ============================================"
          : "🚀 ============================================",
      );
      console.log(
        useHttps
          ? `🔒 Fremio Backend API running on HTTPS port ${PORT}`
          : `🚀 Fremio Backend API running on port ${PORT}`,
      );
      console.log(`🚀 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🚀 Frontend URL: ${process.env.FRONTEND_URL}`);
      console.log("🚀 Realtime:");
      console.log("   WS  /ws/take-moment");
      console.log(
        useHttps
          ? "🔒 ============================================"
          : "🚀 ============================================",
      );
      console.log("");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

export default app;
