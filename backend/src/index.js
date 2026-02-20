require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const { WebSocketServer } = require("ws");

// Import routes
const authRoutes = require("./routes/auth");
const frameRoutes = require("./routes/frames");
const draftRoutes = require("./routes/drafts");
const uploadRoutes = require("./routes/upload");
const userRoutes = require("./routes/users");
const analyticsRoutes = require("./routes/analytics");
const groupRoutes = require("./routes/groups");
const webrtcRoutes = require("./routes/webrtc");
const paymentRoutes = require("../routes/payment");
const adminPackagesRoutes = require("../routes/adminPackages");

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure upload directories exist
const uploadDirs = [
  "uploads/frames",
  "uploads/thumbnails",
  "uploads/overlays",
  "uploads/temp",
  "logs",
];
uploadDirs.forEach((dir) => {
  const fullPath = path.join(__dirname, "..", dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

// Rate limiting - General (higher limit for development)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased for development
  message: { error: "Terlalu banyak request, coba lagi nanti." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for admin upload routes
    return req.path.includes("/upload") || req.path.includes("/frames");
  },
});
app.use("/api/", limiter);

// Rate limiting - Analytics (higher limit for tracking)
const analyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute (1 per second average)
  message: { error: "Rate limit exceeded for analytics" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/analytics/track", analyticsLimiter);

// CORS - allow frontend
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  "https://fremio.id",
  "https://www.fremio.id",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5180",
  "http://localhost:3000",
  "https://localhost:5173",
  "https://localhost:5174",
  "https://localhost:5180",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5180",
  "http://192.168.100.160:5173",
  "http://192.168.100.160:5174",
  "http://192.168.100.160:5180",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc)
      if (!origin) return callback(null, true);

      // Allow all local development origins
      if (
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.includes("192.168.")
      ) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Log rejected origins for debugging
      console.log("⚠️ CORS rejected origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Logging
if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

// Static files for uploads
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"), {
    maxAge: "30d",
    etag: true,
  })
);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/frames", frameRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/users", userRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/webrtc", webrtcRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/admin/packages", adminPackagesRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Fremio API is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// API info
app.get("/api", (req, res) => {
  res.json({
    name: "Fremio API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      frames: "/api/frames",
      drafts: "/api/drafts",
      upload: "/api/upload",
      users: "/api/users",
      analytics: "/api/analytics",
      payment: "/api/payment",
      health: "/api/health",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route tidak ditemukan",
    path: req.path,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  console.error(err.stack);

  // Multer errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(400)
      .json({ error: "File terlalu besar. Maksimal 50MB." });
  }

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Terjadi kesalahan server"
        : err.message,
  });
});

// Start server with HTTPS support
const https = require("https");
const http = require("http");

// ------------------------------
// TakeMoment Friends Realtime (WebSocket)
// ------------------------------

const wsSafeSend = (ws, message) => {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // ignore
  }
};

const wsBroadcast = (clients, message, exceptClientId = null) => {
  for (const [clientId, client] of clients.entries()) {
    if (exceptClientId && clientId === exceptClientId) continue;
    wsSafeSend(client.ws, message);
  }
};

const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

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
    clients: new Map(),
  };
  takeMomentRooms.set(roomId, room);
  return room;
};

const cleanupRoomIfEmpty = (roomId) => {
  const room = takeMomentRooms.get(roomId);
  if (!room) return;
  if (room.clients.size === 0) takeMomentRooms.delete(roomId);
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
          wsSafeSend(ws, { type: "ERROR", payload: { message: "Missing roomId" } });
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

        const clientId = payload?.clientId ? String(payload.clientId) : generateId();
        const isFirst = !room.masterId;
        const role = isFirst ? "master" : "participant";

        connection.roomId = roomId;
        connection.clientId = clientId;
        connection.role = role;

        room.clients.set(clientId, { ws, role });
        if (isFirst) room.masterId = clientId;

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
          clientId
        );
        return;
      }

      if (!connection.roomId || !connection.clientId) {
        wsSafeSend(ws, { type: "ERROR", payload: { message: "Not joined" } });
        return;
      }

      const room = takeMomentRooms.get(connection.roomId);
      if (!room) {
        wsSafeSend(ws, { type: "ERROR", payload: { message: "Room not found" } });
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

        if (typeof nextState.background === "string") {
          room.state.background = nextState.background;
        }
        if (nextState.layoutUnits === "norm" || nextState.layoutUnits === "px") {
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

        // Broadcast ephemeral UI events (e.g., countdown start, capture modal open)
        // to all other clients in the room.
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
          connection.clientId
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

      if (room.masterId === clientId) {
        wsBroadcast(room.clients, {
          type: "SESSION_ENDED",
          payload: { reason: "master_disconnected" },
        });
        room.clients.clear();
        takeMomentRooms.delete(roomId);
        return;
      }

      wsBroadcast(room.clients, { type: "PEER_LEFT", payload: { clientId } });
      cleanupRoomIfEmpty(roomId);
    });
  });
};

// Check for SSL certificates
const certPath = path.join(__dirname, "..", "localhost+3.pem");
const keyPath = path.join(__dirname, "..", "localhost+3-key.pem");
const useHttps = fs.existsSync(certPath) && fs.existsSync(keyPath);

if (useHttps) {
  const httpsOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };

  const server = https.createServer(httpsOptions, app);
  attachTakeMomentWs(server);
  server.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("🔒 ═══════════════════════════════════════");
    console.log(`🔒  Fremio API running on HTTPS port ${PORT}`);
    console.log(`🔒  Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🔒  Health: https://localhost:${PORT}/api/health`);
    console.log("🔒  Realtime: /ws/take-moment");
    console.log("🔒 ═══════════════════════════════════════");
    console.log("");
  });
} else {
  const server = http.createServer(app);
  attachTakeMomentWs(server);
  server.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("🚀 ═══════════════════════════════════════");
    console.log(`🚀  Fremio API running on port ${PORT}`);
    console.log(`🚀  Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🚀  Health: http://localhost:${PORT}/api/health`);
    console.log("🚀  Realtime: /ws/take-moment");
    console.log("🚀 ═══════════════════════════════════════");
    console.log("");
  });
}

module.exports = app;
