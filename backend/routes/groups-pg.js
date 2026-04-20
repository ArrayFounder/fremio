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
