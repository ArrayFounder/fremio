import express from "express";
import jwt from "jsonwebtoken";
import pg from "pg";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "fremio_dev_secret_key";

// Database pool
const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "fremio_user",
  password: process.env.DB_PASSWORD || "",
});

const GROUP_SHARE_ANALYTICS_EVENT_TYPES = new Set([
  "group_open",
  "photo_download_click",
  "video_download_click",
]);
const GROUP_SHARE_DAILY_OPEN_LIMIT = 10;

let ensureGroupShareAnalyticsTablePromise = null;
let ensureEventShareSubmissionsTablePromise = null;

function ensureGroupShareAnalyticsTable() {
  if (!ensureGroupShareAnalyticsTablePromise) {
    ensureGroupShareAnalyticsTablePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS shared_group_analytics (
          id BIGSERIAL PRIMARY KEY,
          share_id VARCHAR(64) NOT NULL,
          event_type VARCHAR(64) NOT NULL,
          event_date DATE NOT NULL DEFAULT CURRENT_DATE,
          session_id VARCHAR(128),
          device_fingerprint VARCHAR(128),
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Add device_fingerprint column if this table was created before this migration
      await pool.query(`
        ALTER TABLE shared_group_analytics
        ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(128)
      `).catch(() => {}); // ignore if already exists
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_shared_group_analytics_share_date
        ON shared_group_analytics (share_id, event_date DESC)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_shared_group_analytics_share_type_date
        ON shared_group_analytics (share_id, event_type, event_date DESC)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_shared_group_analytics_device_date
        ON shared_group_analytics (device_fingerprint, event_date DESC)
        WHERE device_fingerprint IS NOT NULL
      `).catch(() => {}); // index may already exist
    })().catch((error) => {
      ensureGroupShareAnalyticsTablePromise = null;
      throw error;
    });
  }

  return ensureGroupShareAnalyticsTablePromise;
}

function ensureEventShareSubmissionsTable() {
  if (!ensureEventShareSubmissionsTablePromise) {
    ensureEventShareSubmissionsTablePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS event_share_submissions (
          id BIGSERIAL PRIMARY KEY,
          share_id VARCHAR(64) NOT NULL UNIQUE,
          requested_by_user_id BIGINT,
          requested_by_email VARCHAR(255),
          requested_by_name VARCHAR(255),
          message TEXT,
          status VARCHAR(16) NOT NULL DEFAULT 'pending',
          admin_note TEXT,
          reviewed_by_email VARCHAR(255),
          reviewed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT event_share_submissions_status_check
            CHECK (status IN ('pending', 'approved', 'rejected'))
        )
      `);
      await pool.query(`
        ALTER TABLE event_share_submissions
        ADD COLUMN IF NOT EXISTS event_date DATE
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_event_share_submissions_status_created
        ON event_share_submissions (status, created_at DESC)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_event_share_submissions_share
        ON event_share_submissions (share_id)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_event_share_submissions_event_date
        ON event_share_submissions (event_date)
      `);
    })().catch((error) => {
      ensureEventShareSubmissionsTablePromise = null;
      throw error;
    });
  }

  return ensureEventShareSubmissionsTablePromise;
}

function parseJsonValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractShareIdFromInput(value) {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  if (isValidSlug(raw)) return raw;

  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname || "";
    } catch {
      return null;
    }
  }

  const segments = String(pathname)
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);

  if (segments.length < 2) return null;

  const parent = segments[segments.length - 2]?.toLowerCase();
  const slug = segments[segments.length - 1] || "";
  if ((parent === "share" || parent === "g") && isValidSlug(slug)) {
    return slug;
  }

  return null;
}

function getFirstFrameThumbnail(framesValue) {
  const frames = parseJsonValue(framesValue);
  if (!Array.isArray(frames) || frames.length === 0) return null;
  const first = frames[0] || {};
  const candidates = [
    first.thumbnail,
    first.thumbnailUrl,
    first.preview,
    first.imagePath,
    first.frameImage,
  ];
  const picked = candidates.find((item) => typeof item === "string" && item.trim());
  return picked ? picked.trim() : null;
}

function getRequesterName(user = {}) {
  if (typeof user?.displayName === "string" && user.displayName.trim()) return user.displayName.trim();
  if (typeof user?.name === "string" && user.name.trim()) return user.name.trim();
  if (typeof user?.email === "string" && user.email.includes("@")) {
    return user.email.split("@")[0];
  }
  return "Owner";
}

function normalizeEventDateInput(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const [year, month, day] = raw.split("-").map((item) => Number.parseInt(item, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }
  return raw;
}

function toJakartaDateKey(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}
/**
 * Returns the daily access quota limit for a given owner email.
 * Checks share_plus_subscriptions for an active tier; falls back to 10 (free tier).
 */
async function getSharePlusDailyLimit(dbClient, ownerEmail) {
  const FREE_TIER_LIMIT = GROUP_SHARE_DAILY_OPEN_LIMIT;
  if (!ownerEmail) return FREE_TIER_LIMIT;
  try {
    const result = await dbClient.query(
      `SELECT daily_quota::int AS daily_quota
       FROM share_plus_subscriptions
       WHERE user_email = $1 AND status = 'active' AND expires_at > NOW()
       ORDER BY daily_quota DESC LIMIT 1`,
      [ownerEmail]
    );
    const quota = Number(result.rows[0]?.daily_quota || 0);
    if (quota > 0) return quota;
  } catch {
    // share_plus_subscriptions table may not exist yet; degrade gracefully
  }
  return FREE_TIER_LIMIT;
}

function getPreferencesOwnerEmail(preferences) {
  const parsed = parseJsonValue(preferences);
  const ownerEmail = parsed?.ownerEmail;

  return typeof ownerEmail === "string" && ownerEmail.trim()
    ? ownerEmail.trim().toLowerCase()
    : null;
}

function getNextMidnightIso() {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return next.toISOString();
}

async function getGroupShareQuotaSummary(dbClient, ownerEmail) {
  const normalizedOwnerEmail = typeof ownerEmail === "string" ? ownerEmail.trim().toLowerCase() : "";

  const dailyLimit = await getSharePlusDailyLimit(dbClient, normalizedOwnerEmail || null);

  if (!normalizedOwnerEmail) {
    return {
      dailyLimit,
      usedToday: 0,
      remainingToday: dailyLimit,
      resetAt: getNextMidnightIso(),
    };
  }

  // Count distinct devices (unique device per owner per day).
  // Rows without a device_fingerprint (old data) each count as their own unique entry.
  const result = await dbClient.query(
    `SELECT COUNT(DISTINCT COALESCE(NULLIF(analytics.device_fingerprint, ''), 'anon_' || analytics.id::text))::int AS used_today
     FROM shared_group_analytics analytics
     INNER JOIN shared_groups groups ON groups.share_id = analytics.share_id
     WHERE analytics.event_type = 'group_open'
       AND analytics.event_date = CURRENT_DATE
       AND LOWER(COALESCE(groups.preferences->>'ownerEmail', '')) = $1`,
    [normalizedOwnerEmail]
  );

  const usedToday = Number(result.rows[0]?.used_today || 0);
  return {
    dailyLimit,
    usedToday,
    remainingToday: Math.max(0, dailyLimit - usedToday),
    resetAt: getNextMidnightIso(),
  };
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token akses diperlukan" });
  }

  jwt.verify(token, JWT_SECRET, (error, decoded) => {
    if (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token sudah expired" });
      }

      return res.status(403).json({ error: "Token tidak valid" });
    }

    req.user = decoded;
    next();
  });
}

// Auto-migrate: ensure shared_groups table exists
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shared_groups (
        id          SERIAL PRIMARY KEY,
        share_id    VARCHAR(16) UNIQUE NOT NULL,
        title       TEXT,
        frames      JSONB NOT NULL,
        preferences JSONB,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_shared_groups_share_id ON shared_groups(share_id)`
    );
    console.log("✅ shared_groups table ready");
  } catch (e) {
    console.error("❌ shared_groups migration failed:", e.message);
  }
})();

// Generate short share ID
function generateShareId() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function insertSharedGroup({ title, frames, preferences }) {
  // Try a few times to avoid rare share_id collisions
  for (let attempt = 0; attempt < 5; attempt++) {
    const shareId = generateShareId();
    try {
      const preferencesJson =
        preferences && typeof preferences === "object"
          ? JSON.stringify(preferences)
          : typeof preferences === "string"
            ? preferences
            : null;

      const result = await pool.query(
        `INSERT INTO shared_groups (share_id, title, frames, preferences)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          shareId,
          title || "Group Frames",
          JSON.stringify(frames),
          preferencesJson,
        ]
      );
      return result.rows[0];
    } catch (error) {
      // 23505 = unique_violation (share_id collision)
      if (error && error.code === "23505") continue;

      // 42703 = undefined_column (older schema without preferences)
      if (error && error.code === "42703") {
        const fallback = await pool.query(
          `INSERT INTO shared_groups (share_id, title, frames)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [shareId, title || "Group Frames", JSON.stringify(frames)]
        );
        return fallback.rows[0];
      }

      throw error;
    }
  }

  const err = new Error("Failed to generate unique share ID");
  err.status = 500;
  throw err;
}

async function upsertSharedGroup({ shareId, title, frames, preferences }) {
  const preferencesJson =
    preferences && typeof preferences === "object"
      ? JSON.stringify(preferences)
      : typeof preferences === "string"
        ? preferences
        : null;
  try {
    const result = await pool.query(
      `INSERT INTO shared_groups (share_id, title, frames, preferences)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (share_id) DO UPDATE SET
         title = EXCLUDED.title,
         frames = EXCLUDED.frames,
         preferences = EXCLUDED.preferences
       RETURNING *`,
      [shareId, title || "Group Frames", JSON.stringify(frames), preferencesJson]
    );
    return result.rows[0];
  } catch (error) {
    if (error && error.code === "42703") {
      const fallback = await pool.query(
        `INSERT INTO shared_groups (share_id, title, frames)
         VALUES ($1, $2, $3)
         ON CONFLICT (share_id) DO UPDATE SET
           title = EXCLUDED.title,
           frames = EXCLUDED.frames
         RETURNING *`,
        [shareId, title || "Group Frames", JSON.stringify(frames)]
      );
      return fallback.rows[0];
    }
    throw error;
  }
}

async function insertSharedGroupWithSlug({ shareId, title, frames, preferences }) {
  const preferencesJson =
    preferences && typeof preferences === "object"
      ? JSON.stringify(preferences)
      : typeof preferences === "string"
        ? preferences
        : null;

  try {
    const result = await pool.query(
      `INSERT INTO shared_groups (share_id, title, frames, preferences)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [shareId, title || "Group Frames", JSON.stringify(frames), preferencesJson]
    );
    return result.rows[0];
  } catch (error) {
    if (error && error.code === "23505") {
      const conflictError = new Error("Link share tidak tersedia. Silakan gunakan link lain.");
      conflictError.status = 409;
      conflictError.code = "SHARE_ID_TAKEN";
      throw conflictError;
    }

    if (error && error.code === "42703") {
      const fallback = await pool.query(
        `INSERT INTO shared_groups (share_id, title, frames)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [shareId, title || "Group Frames", JSON.stringify(frames)]
      );
      return fallback.rows[0];
    }

    throw error;
  }
}

function isValidSlug(str) {
  return typeof str === "string" && /^[a-zA-Z0-9_-]{3,60}$/.test(str);
}

// Public share endpoint - no auth required
router.post("/public-share", async (req, res) => {
  try {
    const { title, frames, preferences, shareId: customShareId } = req.body;
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "Frames list is required" });
    }

    if (customShareId !== undefined && !isValidSlug(customShareId)) {
      return res.status(400).json({
        error: "shareId hanya boleh mengandung huruf, angka, - dan _, panjang 3–60 karakter.",
      });
    }

    const capped = frames.slice(0, 50).map((f) => ({
      shareId: f?.shareId,
      title: f?.title || "Frame",
      description: f?.description || "",
      thumbnail: f?.thumbnail || null,
    }));

    const invalid = capped.some((f) => !f.shareId);
    if (invalid) {
      return res.status(400).json({ error: "Each frame must have shareId" });
    }

    const group = customShareId
      ? await insertSharedGroupWithSlug({ shareId: customShareId, title, frames: capped, preferences })
      : await insertSharedGroup({ title, frames: capped, preferences });

    res.json({ success: true, group });
  } catch (error) {
    console.error("❌ [Groups] Error creating public share:", error);

    if (error?.code === "SHARE_ID_TAKEN" || error?.status === 409) {
      return res.status(409).json({ error: error.message, message: error.message });
    }

    if (error && error.code === "42P01") {
      return res.status(500).json({
        error: "Database schema missing: shared_groups table not found",
      });
    }

    res.status(500).json({ error: "Failed to create group share" });
  }
});

// Update existing shared group (title, frames, preferences) — no auth, identified by shareId

// Update preferences only
router.patch("/public-share/:shareId/preferences", async (req, res) => {
  try {
    const { shareId } = req.params;
    const { preferences } = req.body || {};
    if (!shareId) return res.status(400).json({ success: false, message: "shareId is required" });
    const preferencesJson = preferences && typeof preferences === "object" ? JSON.stringify(preferences) : typeof preferences === "string" ? preferences : null;
    const result = await pool.query(
      "UPDATE shared_groups SET preferences = $1 WHERE share_id = $2 RETURNING share_id, title, preferences, created_at",
      [preferencesJson, shareId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: "Share group tidak ditemukan" });
    res.json({ success: true, group: result.rows[0] });
  } catch (error) {
    console.error("Error updating preferences:", error);
    res.status(500).json({ success: false, message: "Gagal menyimpan preferences" });
  }
});

router.patch("/public-share/:shareId", async (req, res) => {
  try {
    const { shareId } = req.params;
    const { title, frames, preferences, newShareId } = req.body || {};

    if (!shareId) {
      return res.status(400).json({ error: "shareId is required" });
    }

    if (newShareId !== undefined) {
      return res.status(409).json({
        error: "Link group yang sudah dibuat tidak bisa diubah lagi.",
      });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }

    if (Array.isArray(frames) && frames.length > 0) {
      const capped = frames.slice(0, 50).map((f) => ({
        shareId: f?.shareId,
        title: f?.title || "Frame",
        description: f?.description || "",
        thumbnail: f?.thumbnail || null,
      }));
      updates.push(`frames = $${idx++}`);
      values.push(JSON.stringify(capped));
    }

    if (preferences !== undefined) {
      const preferencesJson = preferences && typeof preferences === "object"
        ? JSON.stringify(preferences)
        : typeof preferences === "string" ? preferences : null;
      updates.push(`preferences = $${idx++}`);
      values.push(preferencesJson);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(shareId);
    const result = await pool.query(
      `UPDATE shared_groups SET ${updates.join(", ")} WHERE share_id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json({ success: true, group: result.rows[0] });
  } catch (error) {
    console.error("❌ [Groups] Error updating group:", error);
    res.status(500).json({ error: "Failed to update group" });
  }
});

router.post("/share/:shareId/analytics", async (req, res) => {
  try {
    await ensureGroupShareAnalyticsTable();

    const { shareId } = req.params;
    const { eventType, sessionId, metadata } = req.body || {};

    if (!shareId) {
      return res.status(400).json({ success: false, message: "shareId is required" });
    }

    if (!GROUP_SHARE_ANALYTICS_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ success: false, message: "eventType tidak valid" });
    }

    const groupResult = await pool.query(
      `SELECT share_id FROM shared_groups WHERE share_id = $1 LIMIT 1`,
      [shareId]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    await pool.query(
      `INSERT INTO shared_group_analytics (share_id, event_type, session_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        shareId,
        eventType,
        typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null,
        JSON.stringify(metadata && typeof metadata === "object" ? metadata : {}),
      ]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("❌ [Groups] Error tracking share analytics:", error);
    res.status(500).json({ success: false, message: "Failed to track share analytics" });
  }
});

router.get("/public-share/:shareId/analytics", authenticateToken, async (req, res) => {
  try {
    await ensureGroupShareAnalyticsTable();

    const { shareId } = req.params;
    const daysRaw = Number.parseInt(String(req.query?.days || "30"), 10);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 180) : 30;

    const groupResult = await pool.query(
      `SELECT share_id, title, preferences
       FROM shared_groups
       WHERE share_id = $1
       LIMIT 1`,
      [shareId]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    const group = groupResult.rows[0];
    const ownerEmail = getPreferencesOwnerEmail(group.preferences);
    const requesterEmail =
      typeof req.user?.email === "string" ? req.user.email.trim().toLowerCase() : null;

    if (ownerEmail && requesterEmail && ownerEmail !== requesterEmail) {
      return res.status(403).json({
        success: false,
        message: "Kamu tidak punya akses ke analytics group ini",
      });
    }

    const analyticsResult = await pool.query(
      `WITH date_series AS (
         SELECT generate_series(
           CURRENT_DATE - ($2::int - 1) * INTERVAL '1 day',
           CURRENT_DATE,
           INTERVAL '1 day'
         )::date AS event_date
       ),
       daily_events AS (
         SELECT
           event_date,
           COUNT(*) FILTER (WHERE event_type = 'group_open')::int AS link_opens,
           COUNT(*) FILTER (WHERE event_type = 'photo_download_click')::int AS photo_downloads,
           COUNT(*) FILTER (WHERE event_type = 'video_download_click')::int AS video_downloads
         FROM shared_group_analytics
         WHERE share_id = $1
           AND event_date >= CURRENT_DATE - ($2::int - 1) * INTERVAL '1 day'
         GROUP BY event_date
       )
       SELECT
         TO_CHAR(date_series.event_date, 'YYYY-MM-DD') AS event_date,
         COALESCE(daily_events.link_opens, 0)::int AS link_opens,
         COALESCE(daily_events.photo_downloads, 0)::int AS photo_downloads,
         COALESCE(daily_events.video_downloads, 0)::int AS video_downloads
       FROM date_series
       LEFT JOIN daily_events ON daily_events.event_date = date_series.event_date
       ORDER BY date_series.event_date DESC`,
      [shareId, days]
    );

    const daily = analyticsResult.rows.map((row) => ({
      eventDate: row.event_date,
      linkOpens: Number(row.link_opens || 0),
      photoDownloads: Number(row.photo_downloads || 0),
      videoDownloads: Number(row.video_downloads || 0),
    }));

    const totals = daily.reduce(
      (accumulator, item) => ({
        linkOpens: accumulator.linkOpens + item.linkOpens,
        photoDownloads: accumulator.photoDownloads + item.photoDownloads,
        videoDownloads: accumulator.videoDownloads + item.videoDownloads,
      }),
      { linkOpens: 0, photoDownloads: 0, videoDownloads: 0 }
    );

    res.json({
      success: true,
      analytics: {
        shareId,
        title: group.title || "Group Frames",
        rangeDays: days,
        totals,
        daily,
      },
    });
  } catch (error) {
    console.error("❌ [Groups] Error fetching share analytics:", error);
    res.status(500).json({ success: false, message: "Failed to fetch group analytics" });
  }
});

router.get("/share-quota", authenticateToken, async (req, res) => {
  try {
    await ensureGroupShareAnalyticsTable();

    const requesterEmail = typeof req.user?.email === "string"
      ? req.user.email.trim().toLowerCase()
      : null;

    if (!requesterEmail) {
      return res.status(400).json({ success: false, message: "Email user tidak tersedia" });
    }

    const quota = await getGroupShareQuotaSummary(pool, requesterEmail);

    res.json({
      success: true,
      quota: {
        ...quota,
        ownerEmail: requesterEmail,
      },
    });
  } catch (error) {
    console.error("❌ [Groups] Error fetching share quota:", error);
    res.status(500).json({ success: false, message: "Failed to fetch share quota" });
  }
});

router.get("/my-share-links", authenticateToken, async (req, res) => {
  try {
    const requesterEmail = typeof req.user?.email === "string" ? req.user.email.trim().toLowerCase() : "";
    if (!requesterEmail) {
      return res.status(400).json({ success: false, message: "Email user tidak valid" });
    }

    const result = await pool.query(
      `SELECT share_id, title, created_at
       FROM shared_groups
       WHERE LOWER(COALESCE(preferences->>'ownerEmail', '')) = $1
       ORDER BY created_at DESC
       LIMIT 300`,
      [requesterEmail]
    );

    const items = result.rows.map((row) => ({
      shareId: row.share_id,
      title: row.title || `Group ${row.share_id}`,
      url: `/share/${row.share_id}`,
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      total: items.length,
      items,
    });
  } catch (error) {
    console.error("❌ [Groups] Failed to fetch my share links:", error);
    res.status(500).json({ success: false, message: "Gagal memuat link share milik kamu" });
  }
});

router.delete("/my-share-links/:shareId", authenticateToken, async (req, res) => {
  let client = null;

  try {
    const shareId = typeof req.params?.shareId === "string" ? req.params.shareId.trim() : "";
    const requesterEmail = typeof req.user?.email === "string" ? req.user.email.trim().toLowerCase() : "";
    const isAdmin = req.user?.role === "admin";

    if (!shareId) {
      return res.status(400).json({ success: false, message: "shareId wajib diisi" });
    }

    const groupResult = await pool.query(
      `SELECT share_id, preferences FROM shared_groups WHERE share_id = $1 LIMIT 1`,
      [shareId]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Link share tidak ditemukan" });
    }

    const ownerEmail = getPreferencesOwnerEmail(groupResult.rows[0].preferences);
    if (!isAdmin) {
      if (!requesterEmail) {
        return res.status(400).json({ success: false, message: "Email user tidak valid" });
      }
      if (!ownerEmail || ownerEmail !== requesterEmail) {
        return res.status(403).json({ success: false, message: "Kamu tidak punya akses menghapus link share ini" });
      }
    }

    client = await pool.connect();
    await client.query("BEGIN");

    try {
      await ensureGroupShareAnalyticsTable();
      await client.query(`DELETE FROM shared_group_analytics WHERE share_id = $1`, [shareId]);
    } catch (error) {
      if (!error || error.code !== "42P01") throw error;
    }

    try {
      await ensureEventShareSubmissionsTable();
      await client.query(`DELETE FROM event_share_submissions WHERE share_id = $1`, [shareId]);
    } catch (error) {
      if (!error || error.code !== "42P01") throw error;
    }

    await client.query(`DELETE FROM shared_groups WHERE share_id = $1`, [shareId]);

    await client.query("COMMIT");
    res.json({ success: true, deletedShareId: shareId });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
    }

    console.error("❌ [Groups] Failed to delete my share link:", error);
    res.status(500).json({ success: false, message: "Gagal menghapus link share" });
  } finally {
    if (client) client.release();
  }
});

// Public events list (approved only)
router.get("/events", async (req, res) => {
  try {
    await ensureEventShareSubmissionsTable();

    const limitRaw = Number.parseInt(String(req.query?.limit || "60"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 120) : 60;
    const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";

    const rowParams = [limit];
    const countParams = [];
    let rowsWhereClause = `WHERE ev.status = 'approved'`;
    let countWhereClause = `WHERE ev.status = 'approved'`;
    if (q) {
      const searchPattern = `%${q}%`;
      rowParams.push(searchPattern);
      countParams.push(searchPattern);
      rowsWhereClause += ` AND (sg.title ILIKE $2 OR ev.share_id ILIKE $2)`;
      countWhereClause += ` AND (sg.title ILIKE $1 OR ev.share_id ILIKE $1)`;
    }

    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT ev.id, ev.share_id, ev.message, ev.event_date, ev.created_at AS submitted_at, ev.reviewed_at,
                sg.title, sg.frames
         FROM event_share_submissions ev
         INNER JOIN shared_groups sg ON sg.share_id = ev.share_id
         ${rowsWhereClause}
         ORDER BY COALESCE(ev.reviewed_at, ev.updated_at, ev.created_at) DESC
         LIMIT $1`,
        rowParams
      ),
      pool.query(
        `SELECT COUNT(*) AS total
         FROM event_share_submissions ev
         INNER JOIN shared_groups sg ON sg.share_id = ev.share_id
         ${countWhereClause}`,
        countParams
      ),
    ]);

    const items = rowsResult.rows.map((row) => ({
      id: Number(row.id),
      shareId: row.share_id,
      title: row.title || `Event ${row.share_id}`,
      description: row.message || "",
      eventDate: toJakartaDateKey(row.event_date),
      thumbnail: getFirstFrameThumbnail(row.frames),
      url: `/share/${row.share_id}`,
      submittedAt: row.submitted_at,
      approvedAt: row.reviewed_at || null,
    }));

    res.json({
      success: true,
      total: Number(countResult.rows[0]?.total || 0),
      items,
    });
  } catch (error) {
    console.error("❌ [Groups] Failed to fetch events:", error);
    res.status(500).json({ success: false, message: "Gagal memuat daftar event" });
  }
});

// Owner apply event submission (requires login)
router.post("/events/apply", authenticateToken, async (req, res) => {
  try {
    await ensureEventShareSubmissionsTable();

    const shareInput = req.body?.shareLink || req.body?.shareId;
    const shareId = extractShareIdFromInput(shareInput);
    const descriptionRaw = req.body?.description ?? req.body?.message;
    const description = typeof descriptionRaw === "string" ? descriptionRaw.trim() : "";
    const eventDate = normalizeEventDateInput(req.body?.eventDate);
    const requesterEmail = typeof req.user?.email === "string" ? req.user.email.trim().toLowerCase() : null;

    if (!shareId) {
      return res.status(400).json({
        success: false,
        message: "Masukkan link share yang valid (contoh: https://fremio.id/share/abc123).",
      });
    }

    if (!description) {
      return res.status(400).json({
        success: false,
        message: "Deskripsi event wajib diisi.",
      });
    }

    if (!eventDate) {
      return res.status(400).json({
        success: false,
        message: "Tanggal event wajib diisi (format YYYY-MM-DD).",
      });
    }

    const groupResult = await pool.query(
      `SELECT share_id, preferences FROM shared_groups WHERE share_id = $1 LIMIT 1`,
      [shareId]
    );
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Link share tidak ditemukan." });
    }

    const ownerEmail = getPreferencesOwnerEmail(groupResult.rows[0].preferences);
    if (ownerEmail && requesterEmail && ownerEmail !== requesterEmail) {
      return res.status(403).json({
        success: false,
        message: "Kamu bukan owner dari link share ini.",
      });
    }

    const existing = await pool.query(
      `SELECT id, status, requested_by_email FROM event_share_submissions WHERE share_id = $1 LIMIT 1`,
      [shareId]
    );
    const existingRow = existing.rows[0] || null;

    if (existingRow?.status === "approved") {
      return res.status(409).json({
        success: false,
        message: "Event ini sudah di-approve dan sudah tampil di halaman event.",
      });
    }

    if (
      existingRow?.requested_by_email &&
      requesterEmail &&
      existingRow.requested_by_email.toLowerCase() !== requesterEmail
    ) {
      return res.status(403).json({
        success: false,
        message: "Event ini sudah diajukan akun owner lain.",
      });
    }

    const upsertResult = await pool.query(
      `INSERT INTO event_share_submissions
         (share_id, requested_by_user_id, requested_by_email, requested_by_name, message, event_date, status, admin_note, reviewed_by_email, reviewed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NULL, NULL, NULL, NOW())
       ON CONFLICT (share_id) DO UPDATE SET
         requested_by_user_id = EXCLUDED.requested_by_user_id,
         requested_by_email = EXCLUDED.requested_by_email,
         requested_by_name = EXCLUDED.requested_by_name,
         message = EXCLUDED.message,
         event_date = EXCLUDED.event_date,
         status = 'pending',
         admin_note = NULL,
         reviewed_by_email = NULL,
         reviewed_at = NULL,
         updated_at = NOW()
       RETURNING id, share_id, status, event_date, created_at, updated_at`,
      [
        shareId,
        Number.isFinite(Number(req.user?.userId)) ? Number(req.user.userId) : null,
        requesterEmail,
        getRequesterName(req.user),
        description || null,
        eventDate,
      ]
    );

    res.json({
      success: true,
      submission: {
        id: Number(upsertResult.rows[0].id),
        shareId: upsertResult.rows[0].share_id,
        status: upsertResult.rows[0].status,
        eventDate: upsertResult.rows[0].event_date || null,
        createdAt: upsertResult.rows[0].created_at,
        updatedAt: upsertResult.rows[0].updated_at,
      },
      message: "Event berhasil diajukan. Tunggu approval admin ya!",
    });
  } catch (error) {
    console.error("❌ [Groups] Failed to apply event:", error);
    res.status(500).json({ success: false, message: "Gagal mengajukan event" });
  }
});

// Admin list event submissions
router.get("/admin/event-submissions", authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Akses admin diperlukan" });
    }

    await ensureEventShareSubmissionsTable();

    const limitRaw = Number.parseInt(String(req.query?.limit || "200"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
    const offsetRaw = Number.parseInt(String(req.query?.offset || "0"), 10);
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
    const status = typeof req.query?.status === "string" ? req.query.status.trim().toLowerCase() : "";
    const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";

    const values = [limit, offset];
    const clauses = [];

    if (["pending", "approved", "rejected"].includes(status)) {
      values.push(status);
      clauses.push(`ev.status = $${values.length}`);
    }

    if (q) {
      values.push(`%${q}%`);
      clauses.push(`(ev.share_id ILIKE $${values.length} OR sg.title ILIKE $${values.length} OR COALESCE(ev.requested_by_email, '') ILIKE $${values.length})`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT ev.id, ev.share_id, ev.status, ev.message, ev.event_date, ev.admin_note,
                ev.requested_by_email, ev.requested_by_name, ev.reviewed_by_email,
                ev.created_at, ev.updated_at, ev.reviewed_at,
                sg.title, sg.frames
         FROM event_share_submissions ev
         INNER JOIN shared_groups sg ON sg.share_id = ev.share_id
         ${whereClause}
         ORDER BY CASE ev.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                  ev.created_at DESC
         LIMIT $1 OFFSET $2`,
        values
      ),
      pool.query(
        `SELECT COUNT(*) AS total
         FROM event_share_submissions ev
         INNER JOIN shared_groups sg ON sg.share_id = ev.share_id
         ${whereClause}`,
        values.slice(2)
      ),
    ]);

    const items = rowsResult.rows.map((row) => ({
      id: Number(row.id),
      shareId: row.share_id,
      title: row.title || `Event ${row.share_id}`,
      thumbnail: getFirstFrameThumbnail(row.frames),
      status: row.status,
      message: row.message || "",
      description: row.message || "",
      eventDate: toJakartaDateKey(row.event_date),
      adminNote: row.admin_note || "",
      ownerEmail: row.requested_by_email || null,
      ownerName: row.requested_by_name || null,
      reviewedBy: row.reviewed_by_email || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reviewedAt: row.reviewed_at || null,
      url: `/share/${row.share_id}`,
    }));

    res.json({
      success: true,
      total: Number(countResult.rows[0]?.total || 0),
      items,
    });
  } catch (error) {
    console.error("❌ [Groups] Admin event submissions error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil data pengajuan event" });
  }
});

// Admin review event submission
router.put("/admin/event-submissions/:id/review", authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Akses admin diperlukan" });
    }

    await ensureEventShareSubmissionsTable();

    const id = Number.parseInt(String(req.params?.id || ""), 10);
    const status = typeof req.body?.status === "string" ? req.body.status.trim().toLowerCase() : "";
    const adminNote = typeof req.body?.adminNote === "string" ? req.body.adminNote.trim() : "";

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "ID pengajuan tidak valid" });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status review tidak valid" });
    }

    const reviewedByEmail = typeof req.user?.email === "string" ? req.user.email.trim().toLowerCase() : null;

    const result = await pool.query(
      `UPDATE event_share_submissions
       SET status = $1,
           admin_note = $2,
           reviewed_by_email = $3,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, share_id, status, admin_note, reviewed_by_email, reviewed_at, updated_at`,
      [status, adminNote || null, reviewedByEmail, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Pengajuan event tidak ditemukan" });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      submission: {
        id: Number(row.id),
        shareId: row.share_id,
        status: row.status,
        adminNote: row.admin_note || "",
        reviewedBy: row.reviewed_by_email || null,
        reviewedAt: row.reviewed_at || null,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error("❌ [Groups] Failed to review event submission:", error);
    res.status(500).json({ success: false, message: "Gagal memproses approval event" });
  }
});

router.delete("/admin/event-submissions/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Akses admin diperlukan" });
    }

    await ensureEventShareSubmissionsTable();

    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "ID pengajuan tidak valid" });
    }

    const result = await pool.query(
      `DELETE FROM event_share_submissions
       WHERE id = $1
       RETURNING id, share_id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Pengajuan event tidak ditemukan" });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      deleted: {
        id: Number(row.id),
        shareId: row.share_id,
      },
    });
  } catch (error) {
    console.error("❌ [Groups] Failed to delete event submission:", error);
    return res.status(500).json({ success: false, message: "Gagal menghapus pengajuan event" });
  }
});
// Get shared group by share_id (public)
router.get("/share/:shareId", async (req, res) => {
  let client = null;

  try {
    await ensureGroupShareAnalyticsTable();

    const { shareId } = req.params;
    client = await pool.connect();
    await client.query("BEGIN");

    let result;
    try {
      result = await client.query(
        `SELECT share_id, title, frames, preferences, created_at
         FROM shared_groups
         WHERE share_id = $1`,
        [shareId]
      );
    } catch (error) {
      // 42703 = undefined_column (older schema without preferences)
      if (error && error.code === "42703") {
        result = await client.query(
          `SELECT share_id, title, frames, created_at
           FROM shared_groups
           WHERE share_id = $1`,
          [shareId]
        );
        if (result.rows.length > 0) {
          result.rows[0].preferences = null;
        }
      } else {
        throw error;
      }
    }

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Group not found" });
    }

    const group = result.rows[0];
    const ownerEmail = getPreferencesOwnerEmail(group.preferences);
    let quota = null;

    // Sanitise device fingerprint from header (max 128 chars, strip non-printable)
    const rawDeviceId = String(req.headers["x-device-id"] || "").trim().slice(0, 128);
    const deviceFingerprint = rawDeviceId.length >= 8 ? rawDeviceId : null;

    if (ownerEmail) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [ownerEmail]);

      // ── Unique-device idempotency ──────────────────────────────────────────
      // If this device already has a recorded open for any link of this owner
      // today, return the group without consuming additional quota.
      if (deviceFingerprint) {
        const alreadyResult = await client.query(
          `SELECT COUNT(*)::int AS cnt
           FROM shared_group_analytics a
           INNER JOIN shared_groups g ON g.share_id = a.share_id
           WHERE a.event_type = 'group_open'
             AND a.event_date = CURRENT_DATE
             AND a.device_fingerprint = $1
             AND LOWER(COALESCE(g.preferences->>'ownerEmail', '')) = $2`,
          [deviceFingerprint, ownerEmail]
        );
        if (Number(alreadyResult.rows[0]?.cnt || 0) > 0) {
          // Device already counted today — idempotent return, no quota consumed.
          await client.query("COMMIT");
          return res.json({ success: true, group, quota: null });
        }
      }

      quota = await getGroupShareQuotaSummary(client, ownerEmail);
    }

    await client.query(
      `INSERT INTO shared_group_analytics (share_id, event_type, device_fingerprint, metadata)
       VALUES ($1, 'group_open', $2, $3)`,
      [
        shareId,
        deviceFingerprint || null,
        JSON.stringify({
          source: "shared-group-load",
          userAgent: req.get("user-agent") || null,
          referer: req.get("referer") || null,
        }),
      ]
    );

    await client.query("COMMIT");

    if (quota) {
      quota = {
        ...quota,
        usedToday: quota.usedToday + 1,
        remainingToday: Math.max(0, quota.remainingToday - 1),
      };
    }

    res.json({ success: true, group, quota });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback errors.
      }
    }
    console.error("❌ [Groups] Error fetching group:", error);
    if (error && error.code === "42P01") {
      return res.status(500).json({
        error: "Database schema missing: shared_groups table not found",
      });
    }
    res.status(500).json({ error: "Failed to fetch group" });
  } finally {
    client?.release();
  }
});

export default router;
