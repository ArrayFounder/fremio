const express = require("express");
const db = require("../config/database");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

const GROUP_SHARE_ANALYTICS_EVENT_TYPES = new Set([
  "group_open",
  "photo_download_click",
  "video_download_click",
]);

let ensureGroupShareAnalyticsTablePromise = null;

function ensureGroupShareAnalyticsTable() {
  if (!ensureGroupShareAnalyticsTablePromise) {
    ensureGroupShareAnalyticsTablePromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS shared_group_analytics (
          id BIGSERIAL PRIMARY KEY,
          share_id VARCHAR(64) NOT NULL,
          event_type VARCHAR(64) NOT NULL,
          event_date DATE NOT NULL DEFAULT CURRENT_DATE,
          session_id VARCHAR(128),
          metadata JSONB,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_shared_group_analytics_share_date
        ON shared_group_analytics (share_id, event_date DESC)
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_shared_group_analytics_share_type_date
        ON shared_group_analytics (share_id, event_type, event_date DESC)
      `);
    })().catch((error) => {
      ensureGroupShareAnalyticsTablePromise = null;
      throw error;
    });
  }

  return ensureGroupShareAnalyticsTablePromise;
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

function generateShareId(length = 8) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function insertSharedGroup({ title, frames, preferences }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const shareId = generateShareId();
    try {
      const preferencesJson =
        preferences && typeof preferences === "object"
          ? JSON.stringify(preferences)
          : typeof preferences === "string"
            ? preferences
            : null;

      const result = await db.query(
        `INSERT INTO shared_groups (share_id, title, frames, preferences)
         VALUES ($1, $2, $3, $4)
         RETURNING share_id, title, frames, preferences, created_at`,
        [shareId, title || "Group Frames", JSON.stringify(frames), preferencesJson]
      );
      return result.rows[0];
    } catch (error) {
      if (error && error.code === "23505") continue;

      if (error && error.code === "42703") {
        const fallback = await db.query(
          `INSERT INTO shared_groups (share_id, title, frames)
           VALUES ($1, $2, $3)
           RETURNING share_id, title, frames, created_at`,
          [shareId, title || "Group Frames", JSON.stringify(frames)]
        );
        const row = fallback.rows[0];
        return { ...row, preferences: null };
      }

      throw error;
    }
  }

  const err = new Error("Failed to generate unique share ID");
  err.status = 500;
  throw err;
}

function isValidSlug(str) {
  return typeof str === "string" && /^[a-zA-Z0-9_-]{3,60}$/.test(str);
}

async function upsertSharedGroup({ shareId, title, frames, preferences }) {
  const preferencesJson =
    preferences && typeof preferences === "object"
      ? JSON.stringify(preferences)
      : typeof preferences === "string"
        ? preferences
        : null;
  try {
    const result = await db.query(
      `INSERT INTO shared_groups (share_id, title, frames, preferences)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (share_id) DO UPDATE SET
         title = EXCLUDED.title,
         frames = EXCLUDED.frames,
         preferences = EXCLUDED.preferences
       RETURNING share_id, title, frames, preferences, created_at`,
      [shareId, title || "Group Frames", JSON.stringify(frames), preferencesJson]
    );
    return result.rows[0];
  } catch (error) {
    // 42703 = undefined_column (older schema without preferences)
    if (error && error.code === "42703") {
      const fallback = await db.query(
        `INSERT INTO shared_groups (share_id, title, frames)
         VALUES ($1, $2, $3)
         ON CONFLICT (share_id) DO UPDATE SET
           title = EXCLUDED.title,
           frames = EXCLUDED.frames
         RETURNING share_id, title, frames, created_at`,
        [shareId, title || "Group Frames", JSON.stringify(frames)]
      );
      const row = fallback.rows[0];
      return { ...row, preferences: null };
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
    const result = await db.query(
      `INSERT INTO shared_groups (share_id, title, frames, preferences)
       VALUES ($1, $2, $3, $4)
       RETURNING share_id, title, frames, preferences, created_at`,
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
      const fallback = await db.query(
        `INSERT INTO shared_groups (share_id, title, frames)
         VALUES ($1, $2, $3)
         RETURNING share_id, title, frames, created_at`,
        [shareId, title || "Group Frames", JSON.stringify(frames)]
      );
      const row = fallback.rows[0];
      return { ...row, preferences: null };
    }

    throw error;
  }
}

/**
 * POST /api/groups/public-share
 * Create a public share record for a group of frames (no auth)
 */
router.post("/public-share", async (req, res) => {
  try {
    const { title, frames, preferences, shareId: customShareId } = req.body || {};

    if (!Array.isArray(frames) || frames.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Frames list is required" });
    }

    if (customShareId !== undefined && !isValidSlug(customShareId)) {
      return res.status(400).json({
        success: false,
        message: "shareId hanya boleh mengandung huruf, angka, garis (-) dan garis bawah (_), panjang 3–60 karakter.",
      });
    }

    // Keep payload small-ish to prevent abuse
    const capped = frames.slice(0, 50).map((f) => ({
      shareId: f?.shareId,
      title: f?.title || "Frame",
      description: f?.description || "",
      thumbnail: f?.thumbnail || null,
    }));

    if (capped.some((f) => !f.shareId)) {
      return res
        .status(400)
        .json({ success: false, message: "Each frame must have shareId" });
    }

    const group = customShareId
      ? await insertSharedGroupWithSlug({ shareId: customShareId, title, frames: capped, preferences })
      : await insertSharedGroup({ title, frames: capped, preferences });

    res.json({ success: true, group });
  } catch (error) {
    console.error("❌ [Groups] Error creating public share:", error);

    if (error?.code === "SHARE_ID_TAKEN" || error?.status === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
        error: error.message,
      });
    }

    // Likely schema missing (migrations not run)
    if (error && error.code === "42P01") {
      return res.status(500).json({
        success: false,
        message: "Database schema missing: shared_groups table not found",
      });
    }

    res
      .status(500)
      .json({ success: false, message: "Failed to create group share" });
  }
});

/**
 * PATCH /api/groups/public-share/:shareId/preferences
 * Update only the preferences of an existing shared group
 */
router.patch("/public-share/:shareId/preferences", async (req, res) => {
  try {
    const { shareId } = req.params;
    const { preferences } = req.body || {};

    if (!shareId) {
      return res.status(400).json({ success: false, message: "shareId is required" });
    }

    const preferencesJson =
      preferences && typeof preferences === "object"
        ? JSON.stringify(preferences)
        : typeof preferences === "string"
          ? preferences
          : null;

    const result = await db.query(
      "UPDATE shared_groups SET preferences = $1 WHERE share_id = $2 RETURNING share_id, title, preferences, created_at",
      [preferencesJson, shareId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Share group tidak ditemukan" });
    }

    res.json({ success: true, group: result.rows[0] });
  } catch (error) {
    console.error("❌ [Groups] Error updating preferences:", error);
    res.status(500).json({ success: false, message: "Gagal menyimpan preferences" });
  }
});

/**
 * PATCH /api/groups/public-share/:shareId
 * Update an existing shared group without changing its immutable share_id
 */
router.patch("/public-share/:shareId", async (req, res) => {
  try {
    const { shareId } = req.params;
    const { title, frames, preferences, newShareId } = req.body || {};

    if (!shareId) {
      return res.status(400).json({ success: false, message: "shareId is required" });
    }

    if (newShareId !== undefined) {
      return res.status(409).json({
        success: false,
        message: "Link group yang sudah dibuat tidak bisa diubah lagi.",
      });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (title !== undefined) {
      updates.push(`title = $${idx++}`);
      values.push(title);
    }

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
      const preferencesJson =
        preferences && typeof preferences === "object"
          ? JSON.stringify(preferences)
          : typeof preferences === "string"
            ? preferences
            : null;
      updates.push(`preferences = $${idx++}`);
      values.push(preferencesJson);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: "No fields to update" });
    }

    values.push(shareId);
    const result = await db.query(
      `UPDATE shared_groups SET ${updates.join(", ")} WHERE share_id = $${idx} RETURNING share_id, title, frames, preferences, created_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    res.json({ success: true, group: result.rows[0] });
  } catch (error) {
    console.error("❌ [Groups] Error updating group:", error);
    res.status(500).json({ success: false, message: "Failed to update group" });
  }
});

/**
 * POST /api/groups/share/:shareId/analytics
 * Track anonymous/public analytics events for a shared group
 */
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

    const groupResult = await db.query(
      `SELECT share_id FROM shared_groups WHERE share_id = $1 LIMIT 1`,
      [shareId]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    await db.query(
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

/**
 * GET /api/groups/public-share/:shareId/analytics?days=30
 * Get owner-facing daily analytics for a shared group
 */
router.get("/public-share/:shareId/analytics", authenticateToken, async (req, res) => {
  try {
    await ensureGroupShareAnalyticsTable();

    const { shareId } = req.params;
    const daysRaw = Number.parseInt(String(req.query?.days || "30"), 10);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 180) : 30;

    const groupResult = await db.query(
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
    const requesterEmail = typeof req.user?.email === "string" ? req.user.email.trim().toLowerCase() : null;

    if (ownerEmail && requesterEmail && ownerEmail !== requesterEmail) {
      return res.status(403).json({ success: false, message: "Kamu tidak punya akses ke analytics group ini" });
    }

    const analyticsResult = await db.query(
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

/**
 * GET /api/groups/share/:shareId
 * Fetch a shared group by share id (public)
 */
router.get("/share/:shareId", async (req, res) => {
  try {
    const { shareId } = req.params;

    let result;
    try {
      result = await db.query(
        `SELECT share_id, title, frames, preferences, created_at
         FROM shared_groups
         WHERE share_id = $1`,
        [shareId]
      );
    } catch (error) {
      // 42703 = undefined_column (older schema without preferences)
      if (error && error.code === "42703") {
        result = await db.query(
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
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }

    res.json({ success: true, group: result.rows[0] });
  } catch (error) {
    console.error("❌ [Groups] Error fetching group:", error);
    if (error && error.code === "42P01") {
      return res.status(500).json({
        success: false,
        message: "Database schema missing: shared_groups table not found",
      });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch group" });
  }
});

/**
 * GET /api/groups/admin/share-links
 * Admin: list all shared_groups with optional search & pagination
 */
router.get("/admin/share-links", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const limit  = Math.min(Math.max(Number.parseInt(req.query?.limit  || "100", 10), 1), 500);
    const offset = Math.max(Number.parseInt(req.query?.offset || "0",   10), 0);
    const q      = typeof req.query?.q === "string" ? req.query.q.trim() : "";

    let whereClause = "";
    const values = [limit, offset];

    if (q) {
      values.push(`%${q}%`);
      whereClause = `WHERE share_id ILIKE $3 OR title ILIKE $3`;
    }

    const [rowsResult, countResult] = await Promise.all([
      db.query(
        `SELECT share_id, title, frames, preferences, created_at
         FROM shared_groups
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        values
      ),
      db.query(
        `SELECT COUNT(*) AS total FROM shared_groups ${whereClause}`,
        q ? [values[2]] : []
      ),
    ]);

    const items = rowsResult.rows.map((row) => {
      let frames = [];
      try { frames = typeof row.frames === "string" ? JSON.parse(row.frames) : (row.frames || []); } catch {}
      let ownerEmail = null;
      try {
        const prefs = typeof row.preferences === "string" ? JSON.parse(row.preferences) : (row.preferences || {});
        ownerEmail = prefs?.ownerEmail || null;
      } catch {}
      return {
        shareId:    row.share_id,
        title:      row.title || "",
        frameCount: Array.isArray(frames) ? frames.length : 0,
        ownerEmail,
        createdAt:  row.created_at,
        url:        `/share/${row.share_id}`,
      };
    });

    res.json({
      success: true,
      total: Number(countResult.rows[0]?.total || 0),
      items,
    });
  } catch (error) {
    console.error("❌ [Groups] Admin share-links error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil data share links" });
  }
});

module.exports = router;
