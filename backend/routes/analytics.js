import express from "express";
import { body } from "express-validator";
import { getFirestore } from "../config/firebase.js";
import { verifyToken, requireAdmin, optionalAuth } from "../middleware/auth.js";
import validate from "../middleware/validator.js";
import pg from "pg";

const router = express.Router();
const FIRESTORE_QUOTA_BACKOFF_MS = 5 * 60 * 1000;
let firestoreQuotaBackoffUntil = 0;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres123",
});

const normalizePagePath = (value) => {
  if (!value || typeof value !== "string") return null;

  let normalized = value.trim();
  if (!normalized) return null;

  try {
    if (/^https?:\/\//i.test(normalized)) {
      normalized = new URL(normalized).pathname || "/";
    }
  } catch {
    // Fallback to the raw value when URL parsing fails.
  }

  normalized = normalized.split("?")[0]?.trim() || normalized;
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/\/+$/, "") || "/";
  return normalized;
};

const normalizeUuid = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
};

const getRequestIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  if (typeof req.ip === "string" && req.ip.trim()) {
    return req.ip.trim();
  }

  return null;
};

const getUserAgent = (req) => {
  const userAgent = req.headers["user-agent"];
  return typeof userAgent === "string" ? userAgent : "";
};

const truncateText = (value, maxLength) => {
  if (typeof value !== "string") return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
};

const getBrowserLabel = (req) => {
  const userAgent = getUserAgent(req);

  if (/edg/i.test(userAgent)) return "Edge";
  if (/opr|opera/i.test(userAgent)) return "Opera";
  if (/crios/i.test(userAgent)) return "Chrome iOS";
  if (/fxios/i.test(userAgent)) return "Firefox iOS";
  if (/chrome/i.test(userAgent)) return "Chrome";
  if (/firefox/i.test(userAgent)) return "Firefox";
  if (/safari/i.test(userAgent)) return "Safari";

  return truncateText(userAgent || "unknown", 50) || "unknown";
};

const getDeviceType = (req) =>
  /mobile|android|iphone|ipad|ipod/i.test(getUserAgent(req))
    ? "mobile"
    : "desktop";

const getRequestPagePath = (req, candidates = []) => {
  for (const candidate of candidates) {
    const normalized = normalizePagePath(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const referer = req.headers.referer;
  return normalizePagePath(typeof referer === "string" ? referer : null);
};

const getReferrerDomain = (referrer) => {
  if (typeof referrer !== "string" || !referrer.trim()) return null;

  try {
    return new URL(referrer).hostname || null;
  } catch {
    return null;
  }
};

const persistSessionToSql = async (req, sessionPayload) => {
  const { sessionId, action, landingPage, referrer, duration, exitPage } = sessionPayload;
  if (!sessionId || !action) return false;

  const userId = normalizeUuid(req.user?.uid || req.user?.userId || null);

  if (action === "start") {
    await pool.query(
      `
        INSERT INTO user_sessions (
          session_id,
          user_id,
          entry_page,
          referrer_domain,
          device_type,
          browser,
          os,
          country
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (session_id) DO NOTHING
      `,
      [
        sessionId,
        userId,
        getRequestPagePath(req, [landingPage]),
        getReferrerDomain(referrer),
        getDeviceType(req),
        getBrowserLabel(req),
        null,
        null,
      ]
    );

    return true;
  }

  if (action === "end") {
    await pool.query(
      `
        UPDATE user_sessions
        SET ended_at = NOW(),
            exit_page = COALESCE($2, exit_page),
            duration_seconds = COALESCE($3, duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER),
            page_count = (SELECT COUNT(*) FROM page_views WHERE session_id = $1),
            is_bounce = (SELECT COUNT(*) FROM page_views WHERE session_id = $1) <= 1
        WHERE session_id = $1
      `,
      [sessionId, getRequestPagePath(req, [exitPage]), duration || null]
    );

    return true;
  }

  return false;
};

const persistEventToSql = async (req, eventPayload) => {
  const { sessionId, eventName, eventCategory, eventData, pagePath } = eventPayload;

  await pool.query(
    `
      INSERT INTO user_events (session_id, user_id, event_name, event_category, event_data, page_path)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      sessionId || null,
      normalizeUuid(req.user?.uid || req.user?.userId || null),
      eventName || "unknown",
      eventCategory || "general",
      JSON.stringify(eventData || {}),
      getRequestPagePath(req, [pagePath, eventData?.pagePath, eventData?.page]),
    ]
  );

  return true;
};

const persistPageviewToSql = async (req, pageviewPayload) => {
  const { sessionId, pagePath, pageUrl, pageTitle, referrer } = pageviewPayload;

  await pool.query(
    `
      INSERT INTO page_views (
        session_id,
        user_id,
        page_path,
        page_title,
        referrer,
        device_type,
        browser,
        browser_version,
        os,
        os_version,
        screen_width,
        screen_height,
        country,
        city,
        ip_address,
        time_on_page
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, $8, 0)
    `,
    [
      sessionId || null,
      normalizeUuid(req.user?.uid || req.user?.userId || null),
      getRequestPagePath(req, [pagePath, pageUrl]),
      pageTitle || null,
      referrer || null,
      getDeviceType(req),
      getBrowserLabel(req),
      getRequestIp(req),
    ]
  );

  return true;
};

const getDateKey = (timestamp) => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const getMonthKey = (timestamp) => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
};

const getVisitorKey = (payload = {}, fallbackKey = null) => {
  if (payload.userId) return `user:${payload.userId}`;
  if (payload.sessionId) return `session:${payload.sessionId}`;
  if (payload.ip) return `ip:${payload.ip}`;
  return fallbackKey;
};

const addVisitorToBucket = (map, bucketKey, visitorKey) => {
  if (!bucketKey || !visitorKey) return;
  if (!map.has(bucketKey)) {
    map.set(bucketKey, new Set());
  }
  map.get(bucketKey).add(visitorKey);
};

const incrementBucket = (map, bucketKey, amount = 1) => {
  if (!bucketKey) return;
  map.set(bucketKey, (map.get(bucketKey) || 0) + amount);
};

const matchesTrackedPath = (path, prefixes = []) => {
  if (!path) return false;
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
};

const isFirestoreQuotaExceeded = (error) => {
  const message = `${error?.message || ""} ${error?.details || ""}`;
  return Number(error?.code) === 8 || /resource_exhausted|quota exceeded/i.test(message);
};

const isFirestoreQuotaBackoffActive = () => firestoreQuotaBackoffUntil > Date.now();

const activateFirestoreQuotaBackoff = () => {
  firestoreQuotaBackoffUntil = Date.now() + FIRESTORE_QUOTA_BACKOFF_MS;
};

const getAnalyticsTrackingFirestore = ({ sqlTracked = false } = {}) => {
  if (sqlTracked || isFirestoreQuotaBackoffActive()) {
    return null;
  }

  return getFirestore();
};

const buildOverviewFallback = () => ({
  success: true,
  degraded: true,
  totalUsers: 0,
  totalFrames: 0,
  totalSessions: 0,
  downloads: 0,
  uniqueUsers: 0,
  photosTaken: 0,
  shares: 0,
  conversionRate: 0,
  topFrames: [],
});

const buildAccessInsightsFallback = () => ({
  success: true,
  degraded: true,
  generatedAt: new Date().toISOString(),
  accessByDay: [],
  accessByMonth: [],
  pageAccess: [
    { key: "membership", label: "Membership", uniqueVisitors: 0, totalViews: 0 },
    { key: "create", label: "Create", uniqueVisitors: 0, totalViews: 0 },
    { key: "share", label: "Share", uniqueVisitors: 0, totalViews: 0 },
  ],
  frameClicks: {
    today: { label: "Hari Ini", uniqueVisitors: 0, totalClicks: 0 },
    yesterday: { label: "Kemarin", uniqueVisitors: 0, totalClicks: 0 },
    month: { label: "Bulan Ini", uniqueVisitors: 0, totalClicks: 0 },
  },
});

/**
 * POST /api/analytics/track
 * Track analytics event
 */
router.post(
  "/track",
  optionalAuth,
  [
    body("eventType")
      .isIn([
        "frame_view",
        "frame_use",
        "photo_download",
        "video_download",
        "frame_like",
      ])
      .withMessage("Invalid event type"),
    body("frameId").optional().isString(),
    body("frameName").optional().isString(),
    body("draftId").optional().isString(),
  ],
  validate,
  async (req, res) => {
    let sqlTracked = false;
    let firestoreTracked = false;

    try {
      const { eventType, frameId, frameName, draftId } = req.body;

      try {
        sqlTracked = await persistEventToSql(req, {
          sessionId: req.headers["x-session-id"] || null,
          eventName: eventType,
          eventCategory: "frame",
          eventData: {
            frameId: frameId || null,
            frameName: frameName || null,
            draftId: draftId || null,
          },
        });
      } catch (sqlError) {
        console.error("Track analytics SQL error:", sqlError);
      }

      const db = getAnalyticsTrackingFirestore({ sqlTracked });

      const eventData = {
        userId: req.user ? req.user.uid : null,
        eventType,
        frameId: frameId || null,
        frameName: frameName || null,
        draftId: draftId || null,
        sessionId: req.headers["x-session-id"] || null,
        deviceType: req.headers["user-agent"]?.includes("Mobile")
          ? "mobile"
          : "desktop",
        browser: req.headers["user-agent"] || "unknown",
        timestamp: new Date().toISOString(),
      };

      if (db) {
        try {
          await db.collection("analytics_events").add(eventData);
          firestoreTracked = true;
        } catch (firestoreError) {
          console.error("Track analytics Firestore error:", firestoreError);
          if (isFirestoreQuotaExceeded(firestoreError)) {
            activateFirestoreQuotaBackoff();
          }
        }
      }

      // Update frame stats if applicable
      if (
        db &&
        frameId &&
        ["frame_use", "photo_download", "video_download"].includes(eventType)
      ) {
        const frameDoc = await db
          .collection("custom_frames")
          .doc(frameId)
          .get();

        if (frameDoc.exists) {
          const updates = {};

          if (eventType === "frame_use") {
            updates.uses = (frameDoc.data().uses || 0) + 1;
          } else if (
            eventType === "photo_download" ||
            eventType === "video_download"
          ) {
            updates.downloads = (frameDoc.data().downloads || 0) + 1;
          }

          await db.collection("custom_frames").doc(frameId).update(updates);
        }
      }

      // Update user stats
      if (
        req.user &&
        (eventType === "photo_download" || eventType === "video_download")
      ) {
        const userDoc = await db.collection("users").doc(req.user.uid).get();

        if (userDoc.exists) {
          const updates = {};

          if (eventType === "photo_download") {
            updates.totalPhotosDownloaded =
              (userDoc.data().totalPhotosDownloaded || 0) + 1;
          } else if (eventType === "video_download") {
            updates.totalVideosDownloaded =
              (userDoc.data().totalVideosDownloaded || 0) + 1;
          }

          await db.collection("users").doc(req.user.uid).update(updates);
        }
      }

      res.json({
        success: true,
        message:
          sqlTracked || firestoreTracked
            ? "Event tracked successfully"
            : "Event accepted without persistence",
      });
    } catch (error) {
      console.error("Track event error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to track event",
      });
    }
  }
);

/**
 * GET /api/analytics/frame/:frameId
 * Get frame analytics (Admin only)
 */
router.get("/frame/:frameId", verifyToken, requireAdmin, async (req, res) => {
  try {
    const db = getAnalyticsTrackingFirestore({ sqlTracked });
    const frameId = req.params.frameId;

    // Get frame stats
    const frameDoc = await db.collection("custom_frames").doc(frameId).get();

    if (!frameDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Frame not found",
      });
    }

    const frameData = frameDoc.data();

    // Get analytics events
    const eventsSnapshot = await db
      .collection("analytics_events")
      .where("frameId", "==", frameId)
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();

    const events = eventsSnapshot.docs.map((doc) => doc.data());

    // Calculate stats
    const stats = {
      totalViews: frameData.views || 0,
      totalUses: frameData.uses || 0,
      totalDownloads: frameData.downloads || 0,
      totalLikes: frameData.likes || 0,
      eventsByType: {},
      deviceBreakdown: { mobile: 0, desktop: 0 },
      recentEvents: events.slice(0, 20),
    };

    events.forEach((event) => {
      // Count by event type
      stats.eventsByType[event.eventType] =
        (stats.eventsByType[event.eventType] || 0) + 1;

      // Count by device
      if (event.deviceType === "mobile") {
        stats.deviceBreakdown.mobile++;
      } else {
        stats.deviceBreakdown.desktop++;
      }
    });

    res.json({
      success: true,
      frameId,
      frameName: frameData.name,
      stats,
    });
  } catch (error) {
    console.error("Get frame analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get frame analytics",
    });
  }
});

/**
 * GET /api/analytics/overview
 * Get platform overview analytics (Admin only)
 */
router.get("/overview", verifyToken, requireAdmin, async (req, res) => {
  try {
    const db = getAnalyticsTrackingFirestore({ sqlTracked });

    // Get totals
    const [usersCount, framesCount, draftsCount, eventsCount] =
      await Promise.all([
        db.collection("users").count().get(),
        db.collection("custom_frames").count().get(),
        db.collection("drafts").count().get(),
        db.collection("analytics_events").count().get(),
      ]);

    // Get top frames by views
    const topFramesSnapshot = await db
      .collection("custom_frames")
      .where("status", "==", "approved")
      .orderBy("views", "desc")
      .limit(10)
      .get();

    const topFrames = topFramesSnapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      views: doc.data().views || 0,
      uses: doc.data().uses || 0,
      downloads: doc.data().downloads || 0,
      likes: doc.data().likes || 0,
    }));

    res.json({
      success: true,
      overview: {
        totalUsers: usersCount.data().count,
        totalFrames: framesCount.data().count,
        totalDrafts: draftsCount.data().count,
        totalEvents: eventsCount.data().count,
        topFrames,
      },
    });
  } catch (error) {
    console.error("Get overview error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get analytics overview",
    });
  }
});

/**
 * POST /api/analytics/track/session
 * Track session start/end
 */
router.post("/track/session", optionalAuth, async (req, res) => {
  let sqlTracked = false;
  let firestoreTracked = false;

  try {
    const { sessionId, action, referrer, landingPage, duration } = req.body;

    try {
      sqlTracked = await persistSessionToSql(req, {
        sessionId,
        action,
        referrer,
        landingPage,
        duration,
      });
    } catch (sqlError) {
      console.error("Track session SQL error:", sqlError);
    }

    const db = getAnalyticsTrackingFirestore({ sqlTracked });

    const sessionData = {
      sessionId: sessionId || null,
      action: action || "unknown",
      referrer: referrer || null,
      landingPage: landingPage || null,
      duration: duration || null,
      userId: req.user ? req.user.uid : null,
      deviceType: req.headers["user-agent"]?.includes("Mobile")
        ? "mobile"
        : "desktop",
      browser: req.headers["user-agent"] || "unknown",
      ip: req.ip || req.headers["x-forwarded-for"]?.split(",")[0] || null,
      timestamp: new Date().toISOString(),
    };

    if (db) {
      try {
        await db.collection("analytics_sessions").add(sessionData);
        firestoreTracked = true;
      } catch (firestoreError) {
        console.error("Track session Firestore error:", firestoreError);
        if (isFirestoreQuotaExceeded(firestoreError)) {
          activateFirestoreQuotaBackoff();
        }
      }
    }

    res.json({
      success: true,
      message:
        sqlTracked || firestoreTracked
          ? "Session tracked successfully"
          : "Session accepted without persistence",
    });
  } catch (error) {
    console.error("Track session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track session",
    });
  }
});

/**
 * POST /api/analytics/track/event
 * Track generic events
 */
router.post("/track/event", optionalAuth, async (req, res) => {
  let sqlTracked = false;
  let firestoreTracked = false;

  try {
    const {
      eventName,
      eventCategory,
      eventData,
      sessionId,
      pageUrl,
      pagePath,
      pageTitle,
      timestamp,
      category,
      action,
      metadata,
    } = req.body;

    const resolvedEventName = eventName || action || "unknown";
    const resolvedEventCategory = eventCategory || category || "general";
    const resolvedEventData = eventData || metadata || {};
    const resolvedPagePath = getRequestPagePath(req, [
      pagePath,
      pageUrl,
      resolvedEventData?.pagePath,
      resolvedEventData?.page,
    ]);

    try {
      sqlTracked = await persistEventToSql(req, {
        sessionId,
        eventName: resolvedEventName,
        eventCategory: resolvedEventCategory,
        eventData: resolvedEventData,
        pagePath: resolvedPagePath,
      });
    } catch (sqlError) {
      console.error("Track event SQL error:", sqlError);
    }

    const db = getAnalyticsTrackingFirestore({ sqlTracked });

    const event = {
      eventName: resolvedEventName,
      eventCategory: resolvedEventCategory,
      eventData: resolvedEventData,
      sessionId: sessionId || null,
      pageUrl: pageUrl || null,
      pagePath: resolvedPagePath,
      pageTitle: pageTitle || null,
      userId: req.user ? req.user.uid : null,
      deviceType: req.headers["user-agent"]?.includes("Mobile")
        ? "mobile"
        : "desktop",
      browser: req.headers["user-agent"] || "unknown",
      ip: req.ip || req.headers["x-forwarded-for"]?.split(",")[0] || null,
      timestamp: timestamp || new Date().toISOString(),
      serverTimestamp: new Date().toISOString(),
    };

    if (db) {
      try {
        await db.collection("analytics_events").add(event);
        firestoreTracked = true;
      } catch (firestoreError) {
        console.error("Track event Firestore error:", firestoreError);
        if (isFirestoreQuotaExceeded(firestoreError)) {
          activateFirestoreQuotaBackoff();
        }
      }
    }

    res.json({
      success: true,
      message:
        sqlTracked || firestoreTracked
          ? "Event tracked successfully"
          : "Event accepted without persistence",
    });
  } catch (error) {
    console.error("Track event error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track event",
    });
  }
});

/**
 * POST /api/analytics/track/download
 * Track download events
 */
router.post("/track/download", optionalAuth, async (req, res) => {
  try {
    const db = getAnalyticsTrackingFirestore({ sqlTracked });

    // If Firebase not available, return success without saving
    if (!db) {
      return res.json({
        success: true,
        message: "Download tracked (fallback mode)",
      });
    }

    const { frameId, frameName, format, hasWatermark, sessionId } = req.body;

    const downloadData = {
      frameId: frameId || null,
      frameName: frameName || null,
      format: format || "png",
      hasWatermark: hasWatermark || false,
      sessionId: sessionId || null,
      userId: req.user ? req.user.uid : null,
      deviceType: req.headers["user-agent"]?.includes("Mobile")
        ? "mobile"
        : "desktop",
      browser: req.headers["user-agent"] || "unknown",
      ip: req.ip || req.headers["x-forwarded-for"]?.split(",")[0] || null,
      timestamp: new Date().toISOString(),
    };

    await db.collection("analytics_downloads").add(downloadData);

    // Update frame download count if frameId exists
    if (frameId) {
      try {
        const frameDoc = await db
          .collection("custom_frames")
          .doc(frameId)
          .get();
        if (frameDoc.exists) {
          await db
            .collection("custom_frames")
            .doc(frameId)
            .update({
              downloads: (frameDoc.data().downloads || 0) + 1,
            });
        }
      } catch (e) {
        console.warn("Failed to update frame download count:", e.message);
      }
    }

    res.json({
      success: true,
      message: "Download tracked successfully",
    });
  } catch (error) {
    console.error("Track download error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track download",
    });
  }
});

/**
 * POST /api/analytics/track/pageview
 * Track page views
 */
router.post("/track/pageview", optionalAuth, async (req, res) => {
  let sqlTracked = false;
  let firestoreTracked = false;

  try {
    const { pageUrl, pagePath, pageTitle, sessionId, referrer } = req.body;
    const normalizedPath = normalizePagePath(pagePath || pageUrl);
    const resolvedPageUrl =
      typeof pageUrl === "string" && pageUrl.trim()
        ? pageUrl.trim()
        : normalizedPath;

    try {
      sqlTracked = await persistPageviewToSql(req, {
        sessionId,
        pagePath: normalizedPath,
        pageUrl: resolvedPageUrl,
        pageTitle,
        referrer,
      });
    } catch (sqlError) {
      console.error("Track pageview SQL error:", sqlError);
    }

    const db = getAnalyticsTrackingFirestore({ sqlTracked });

    const pageviewData = {
      pageUrl: resolvedPageUrl || null,
      pagePath: normalizedPath || null,
      pageTitle: pageTitle || null,
      sessionId: sessionId || null,
      referrer: referrer || null,
      userId: req.user ? req.user.uid : null,
      deviceType: req.headers["user-agent"]?.includes("Mobile")
        ? "mobile"
        : "desktop",
      browser: req.headers["user-agent"] || "unknown",
      ip: req.ip || req.headers["x-forwarded-for"]?.split(",")[0] || null,
      timestamp: new Date().toISOString(),
    };

    if (db) {
      try {
        await db.collection("analytics_pageviews").add(pageviewData);
        firestoreTracked = true;
      } catch (firestoreError) {
        console.error("Track pageview Firestore error:", firestoreError);
        if (isFirestoreQuotaExceeded(firestoreError)) {
          activateFirestoreQuotaBackoff();
        }
      }
    }

    res.json({
      success: true,
      message:
        sqlTracked || firestoreTracked
          ? "Pageview tracked successfully"
          : "Pageview accepted without persistence",
    });
  } catch (error) {
    console.error("Track pageview error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track pageview",
    });
  }
});

/**
 * POST /api/analytics/track/performance
 * Track performance metrics
 */
router.post("/track/performance", optionalAuth, async (req, res) => {
  try {
    const db = getFirestore();

    // If Firebase not available, return success without saving
    if (!db) {
      return res.json({
        success: true,
        message: "Performance tracked (fallback mode)",
      });
    }

    const { metric, value, sessionId, pageUrl } = req.body;

    const perfData = {
      metric: metric || "unknown",
      value: value || 0,
      sessionId: sessionId || null,
      pageUrl: pageUrl || null,
      userId: req.user ? req.user.uid : null,
      deviceType: req.headers["user-agent"]?.includes("Mobile")
        ? "mobile"
        : "desktop",
      timestamp: new Date().toISOString(),
    };

    await db.collection("analytics_performance").add(perfData);

    res.json({
      success: true,
      message: "Performance metric tracked successfully",
    });
  } catch (error) {
    console.error("Track performance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track performance",
    });
  }
});

// ==================== DASHBOARD ENDPOINTS ====================

/**
 * Helper function to get date range
 */
const getDateRange = (days) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
};

/**
 * GET /api/analytics/dashboard/overview
 * Get dashboard overview stats
 */
router.get(
  "/dashboard/overview",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      if (isFirestoreQuotaBackoffActive()) {
        return res.json(buildOverviewFallback());
      }

      const db = getFirestore();
      const days = parseInt(req.query.days || req.query.period, 10) || 30;
      const { startDate, endDate } = getDateRange(days);

      if (!db) {
        return res.json(buildOverviewFallback());
      }

      // Get basic counts
      const [
        usersSnapshot,
        framesSnapshot,
        sessionsSnapshot,
        downloadsSnapshot,
      ] = await Promise.all([
        db.collection("users").count().get(),
        db.collection("custom_frames").count().get(),
        db
          .collection("analytics_sessions")
          .where("timestamp", ">=", startDate)
          .count()
          .get(),
        db
          .collection("analytics_downloads")
          .where("timestamp", ">=", startDate)
          .count()
          .get(),
      ]);

      // Get events in date range
      const eventsSnapshot = await db
        .collection("analytics_events")
        .where("timestamp", ">=", startDate)
        .limit(1000)
        .get();

      const events = eventsSnapshot.docs.map((doc) => doc.data());

      // Calculate unique users from events
      const uniqueUserIds = new Set(
        events.filter((e) => e.userId).map((e) => e.userId)
      );

      // Get photos taken count
      const photosTaken = events.filter(
        (e) => e.eventName === "photo_taken" || e.eventCategory === "photo"
      ).length;

      // Get shares count
      const shares = events.filter(
        (e) => e.eventName === "share" || e.eventCategory === "social"
      ).length;

      // Get top frames
      const topFramesSnapshot = await db
        .collection("custom_frames")
        .orderBy("downloads", "desc")
        .limit(10)
        .get();

      const topFrames = topFramesSnapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        downloads: doc.data().downloads || 0,
        views: doc.data().views || 0,
      }));

      res.json({
        success: true,
        totalUsers: usersSnapshot.data().count,
        totalFrames: framesSnapshot.data().count,
        totalSessions: sessionsSnapshot.data().count,
        downloads: downloadsSnapshot.data().count,
        uniqueUsers: uniqueUserIds.size,
        photosTaken,
        shares,
        conversionRate:
          sessionsSnapshot.data().count > 0
            ? (
                (downloadsSnapshot.data().count /
                  sessionsSnapshot.data().count) *
                100
              ).toFixed(2)
            : 0,
        topFrames,
      });
    } catch (error) {
      console.error("Dashboard overview error:", error);

      if (isFirestoreQuotaExceeded(error)) {
        activateFirestoreQuotaBackoff();
        return res.json(buildOverviewFallback());
      }

      res.status(500).json({
        success: false,
        message: "Failed to get dashboard overview",
      });
    }
  }
);

/**
 * GET /api/analytics/dashboard/access-insights
 * Aggregated access insights for admin analytics page.
 */
router.get(
  "/dashboard/access-insights",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const [accessByDayResult, accessByMonthResult, pageAccessResult, frameClicksResult] =
        await Promise.all([
          pool.query(`
            SELECT
              TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS date,
              COUNT(DISTINCT COALESCE(user_id::text, session_id, COALESCE(ip_address::text, CONCAT('pageview:', id::text))))::INTEGER AS "uniqueVisitors",
              COUNT(*)::INTEGER AS "totalPageViews"
            FROM page_views
            WHERE created_at IS NOT NULL
            GROUP BY DATE(created_at)
            ORDER BY date DESC
            LIMIT 180
          `),
          pool.query(`
            SELECT
              TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
              COUNT(DISTINCT COALESCE(user_id::text, session_id, COALESCE(ip_address::text, CONCAT('pageview:', id::text))))::INTEGER AS "uniqueVisitors",
              COUNT(*)::INTEGER AS "totalPageViews"
            FROM page_views
            WHERE created_at IS NOT NULL
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY month DESC
            LIMIT 36
          `),
          pool.query(`
            WITH page_hits AS (
              SELECT
                page_path,
                COALESCE(user_id::text, session_id, COALESCE(ip_address::text, CONCAT('pageview:', id::text))) AS visitor_key
              FROM page_views
              WHERE page_path IS NOT NULL
              UNION ALL
              SELECT
                page_path,
                COALESCE(user_id::text, session_id, CONCAT('event:', id::text)) AS visitor_key
              FROM user_events
              WHERE page_path IS NOT NULL
            )
            SELECT
              page_key AS key,
              CASE page_key
                WHEN 'membership' THEN 'Membership'
                WHEN 'create' THEN 'Create'
                WHEN 'share' THEN 'Share'
              END AS label,
              COUNT(DISTINCT visitor_key)::INTEGER AS "uniqueVisitors",
              COUNT(*)::INTEGER AS "totalViews"
            FROM (
              SELECT
                CASE
                  WHEN page_path = '/pricing' OR page_path LIKE '/pricing/%' OR page_path = '/membership' OR page_path LIKE '/membership/%' THEN 'membership'
                  WHEN page_path = '/create' OR page_path LIKE '/create/%' THEN 'create'
                  WHEN page_path = '/shares' OR page_path LIKE '/shares/%' THEN 'share'
                  ELSE NULL
                END AS page_key,
                visitor_key
              FROM page_hits
            ) mapped_hits
            WHERE page_key IS NOT NULL
            GROUP BY page_key
          `),
          pool.query(`
            WITH frame_events AS (
              SELECT
                DATE(created_at) AS event_date,
                TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month_key,
                COALESCE(user_id::text, session_id, CONCAT('event:', id::text)) AS visitor_key
              FROM user_events
              WHERE event_name IN ('frame_view', 'frame_select')
            )
            SELECT
              COUNT(*) FILTER (WHERE event_date = CURRENT_DATE)::INTEGER AS today_clicks,
              COUNT(DISTINCT visitor_key) FILTER (WHERE event_date = CURRENT_DATE)::INTEGER AS today_visitors,
              COUNT(*) FILTER (WHERE event_date = CURRENT_DATE - 1)::INTEGER AS yesterday_clicks,
              COUNT(DISTINCT visitor_key) FILTER (WHERE event_date = CURRENT_DATE - 1)::INTEGER AS yesterday_visitors,
              COUNT(*) FILTER (
                WHERE month_key = TO_CHAR(DATE_TRUNC('month', CURRENT_DATE), 'YYYY-MM')
              )::INTEGER AS month_clicks,
              COUNT(DISTINCT visitor_key) FILTER (
                WHERE month_key = TO_CHAR(DATE_TRUNC('month', CURRENT_DATE), 'YYYY-MM')
              )::INTEGER AS month_visitors
            FROM frame_events
          `),
        ]);

      const pageAccessByKey = new Map(
        pageAccessResult.rows.map((item) => [item.key, item])
      );
      const frameClickRow = frameClicksResult.rows[0] || {};

      const pageAccess = [
        pageAccessByKey.get("membership") || {
          key: "membership",
          label: "Membership",
          uniqueVisitors: 0,
          totalViews: 0,
        },
        pageAccessByKey.get("create") || {
          key: "create",
          label: "Create",
          uniqueVisitors: 0,
          totalViews: 0,
        },
        pageAccessByKey.get("share") || {
          key: "share",
          label: "Share",
          uniqueVisitors: 0,
          totalViews: 0,
        },
      ];

      const frameClicks = {
        today: {
          label: "Hari Ini",
          uniqueVisitors: frameClickRow.today_visitors || 0,
          totalClicks: frameClickRow.today_clicks || 0,
        },
        yesterday: {
          label: "Kemarin",
          uniqueVisitors: frameClickRow.yesterday_visitors || 0,
          totalClicks: frameClickRow.yesterday_clicks || 0,
        },
        month: {
          label: "Bulan Ini",
          uniqueVisitors: frameClickRow.month_visitors || 0,
          totalClicks: frameClickRow.month_clicks || 0,
        },
      };

      res.json({
        success: true,
        generatedAt: new Date().toISOString(),
        accessByDay: accessByDayResult.rows,
        accessByMonth: accessByMonthResult.rows,
        pageAccess,
        frameClicks,
      });
    } catch (error) {
      console.error("Access insights error:", error);
      return res.json(buildAccessInsightsFallback());
    }
  }
);

/**
 * GET /api/analytics/dashboard/user-growth
 * Get user growth over time
 */
router.get(
  "/dashboard/user-growth",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const db = getFirestore();
      const days = parseInt(req.query.days) || 30;
      const { startDate } = getDateRange(days);

      const usersSnapshot = await db
        .collection("users")
        .where("createdAt", ">=", startDate)
        .orderBy("createdAt", "asc")
        .get();

      // Group by date
      const growth = {};
      usersSnapshot.docs.forEach((doc) => {
        const date =
          doc.data().createdAt?.split("T")[0] ||
          new Date().toISOString().split("T")[0];
        growth[date] = (growth[date] || 0) + 1;
      });

      res.json({
        success: true,
        data: Object.entries(growth).map(([date, count]) => ({
          date,
          newUsers: count,
        })),
        total: usersSnapshot.size,
      });
    } catch (error) {
      console.error("User growth error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get user growth data",
      });
    }
  }
);

/**
 * GET /api/analytics/dashboard/dau
 * Get daily active users
 */
router.get("/dashboard/dau", verifyToken, requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const days = parseInt(req.query.days) || 30;
    const { startDate } = getDateRange(days);

    const sessionsSnapshot = await db
      .collection("analytics_sessions")
      .where("timestamp", ">=", startDate)
      .where("action", "==", "start")
      .get();

    // Group by date and count unique users
    const dauMap = {};
    sessionsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const date =
        data.timestamp?.split("T")[0] || new Date().toISOString().split("T")[0];
      if (!dauMap[date]) {
        dauMap[date] = new Set();
      }
      dauMap[date].add(data.userId || data.sessionId);
    });

    res.json({
      success: true,
      data: Object.entries(dauMap)
        .map(([date, users]) => ({
          date,
          activeUsers: users.size,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error) {
    console.error("DAU error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get DAU data",
    });
  }
});

/**
 * GET /api/analytics/dashboard/downloads
 * Get download analytics
 */
router.get(
  "/dashboard/downloads",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const db = getFirestore();
      const days = parseInt(req.query.days) || 30;
      const { startDate } = getDateRange(days);

      const downloadsSnapshot = await db
        .collection("analytics_downloads")
        .where("timestamp", ">=", startDate)
        .get();

      // Group by date
      const downloadsByDate = {};
      const downloadsByFrame = {};

      downloadsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const date =
          data.timestamp?.split("T")[0] ||
          new Date().toISOString().split("T")[0];
        downloadsByDate[date] = (downloadsByDate[date] || 0) + 1;

        if (data.frameName) {
          downloadsByFrame[data.frameName] =
            (downloadsByFrame[data.frameName] || 0) + 1;
        }
      });

      res.json({
        success: true,
        total: downloadsSnapshot.size,
        byDate: Object.entries(downloadsByDate)
          .map(([date, count]) => ({ date, downloads: count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        topFrames: Object.entries(downloadsByFrame)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, downloads]) => ({ name, downloads })),
      });
    } catch (error) {
      console.error("Downloads analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get download analytics",
      });
    }
  }
);

/**
 * GET /api/analytics/dashboard/retention
 * Get user retention data
 */
router.get(
  "/dashboard/retention",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const weeks = parseInt(req.query.weeks) || 12;

      // Simplified retention - just return placeholder for now
      const retentionData = [];
      for (let i = 0; i < weeks; i++) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - i * 7);
        retentionData.unshift({
          week: i + 1,
          date: weekStart.toISOString().split("T")[0],
          retentionRate: Math.max(100 - i * 5, 10), // Placeholder
        });
      }

      res.json({
        success: true,
        data: retentionData,
      });
    } catch (error) {
      console.error("Retention error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get retention data",
      });
    }
  }
);

/**
 * GET /api/analytics/dashboard/traffic
 * Get traffic sources
 */
router.get(
  "/dashboard/traffic",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const db = getFirestore();
      const days = parseInt(req.query.days) || 30;
      const { startDate } = getDateRange(days);

      const sessionsSnapshot = await db
        .collection("analytics_sessions")
        .where("timestamp", ">=", startDate)
        .where("action", "==", "start")
        .limit(1000)
        .get();

      const sources = {};
      sessionsSnapshot.docs.forEach((doc) => {
        const referrer = doc.data().referrer || "direct";
        let source = "Direct";

        if (referrer.includes("google")) source = "Google";
        else if (referrer.includes("facebook") || referrer.includes("fb."))
          source = "Facebook";
        else if (referrer.includes("instagram")) source = "Instagram";
        else if (referrer.includes("twitter") || referrer.includes("t.co"))
          source = "Twitter";
        else if (referrer.includes("tiktok")) source = "TikTok";
        else if (referrer && referrer !== "direct") source = "Other";

        sources[source] = (sources[source] || 0) + 1;
      });

      res.json({
        success: true,
        data: Object.entries(sources)
          .map(([source, visits]) => ({ source, visits }))
          .sort((a, b) => b.visits - a.visits),
      });
    } catch (error) {
      console.error("Traffic sources error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get traffic sources",
      });
    }
  }
);

/**
 * GET /api/analytics/dashboard/revenue
 * Get revenue analytics (placeholder)
 */
router.get(
  "/dashboard/revenue",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      res.json({
        success: true,
        totalRevenue: 0,
        data: [],
        message: "Revenue tracking not yet implemented",
      });
    } catch (error) {
      console.error("Revenue error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get revenue data",
      });
    }
  }
);

/**
 * GET /api/analytics/dashboard/pages
 * Get top pages
 */
router.get("/dashboard/pages", verifyToken, requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 20;
    const { startDate } = getDateRange(days);

    const pageviewsSnapshot = await db
      .collection("analytics_pageviews")
      .where("timestamp", ">=", startDate)
      .limit(5000)
      .get();

    const pages = {};
    pageviewsSnapshot.docs.forEach((doc) => {
      const url = doc.data().pageUrl || "/";
      pages[url] = (pages[url] || 0) + 1;
    });

    res.json({
      success: true,
      data: Object.entries(pages)
        .map(([url, views]) => ({ url, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, limit),
    });
  } catch (error) {
    console.error("Top pages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get top pages",
    });
  }
});

/**
 * GET /api/analytics/dashboard/devices
 * Get device statistics
 */
router.get(
  "/dashboard/devices",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const db = getFirestore();
      const days = parseInt(req.query.days) || 30;
      const { startDate } = getDateRange(days);

      const sessionsSnapshot = await db
        .collection("analytics_sessions")
        .where("timestamp", ">=", startDate)
        .limit(5000)
        .get();

      const devices = { mobile: 0, desktop: 0, tablet: 0 };
      sessionsSnapshot.docs.forEach((doc) => {
        const deviceType = doc.data().deviceType || "desktop";
        if (deviceType === "mobile") devices.mobile++;
        else if (deviceType === "tablet") devices.tablet++;
        else devices.desktop++;
      });

      res.json({
        success: true,
        data: Object.entries(devices)
          .map(([device, count]) => ({ device, count }))
          .sort((a, b) => b.count - a.count),
      });
    } catch (error) {
      console.error("Device stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get device stats",
      });
    }
  }
);

/**
 * GET /api/analytics/dashboard/realtime
 * Get realtime stats (active users in last 5 minutes)
 */
router.get(
  "/dashboard/realtime",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const db = getFirestore();
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const recentSessionsSnapshot = await db
        .collection("analytics_sessions")
        .where("timestamp", ">=", fiveMinutesAgo)
        .get();

      const activeUsers = new Set();
      recentSessionsSnapshot.docs.forEach((doc) => {
        activeUsers.add(doc.data().sessionId || doc.data().userId);
      });

      res.json({
        success: true,
        activeUsers: activeUsers.size,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Realtime stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get realtime stats",
      });
    }
  }
);

export default router;
