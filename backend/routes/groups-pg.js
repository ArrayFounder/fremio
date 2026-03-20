import express from "express";
import pg from "pg";

const router = express.Router();

// Database pool
const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "fremio_user",
  password: process.env.DB_PASSWORD || "",
});

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

// Public share endpoint - no auth required
router.post("/public-share", async (req, res) => {
  try {
    const { title, frames, preferences } = req.body;

    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "Frames list is required" });
    }

    // Keep payload small-ish to prevent abuse
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

    const group = await insertSharedGroup({
      title,
      frames: capped,
      preferences,
    });

    res.json({ success: true, group });
  } catch (error) {
    console.error("❌ [Groups] Error creating public share:", error);

    // Likely schema missing (migrations not run)
    if (error && error.code === "42P01") {
      return res.status(500).json({
        error: "Database schema missing: shared_groups table not found",
      });
    }

    res.status(500).json({ error: "Failed to create group share" });
  }
});

// Get shared group by share_id (public)
router.get("/share/:shareId", async (req, res) => {
  try {
    const { shareId } = req.params;

    let result;
    try {
      result = await pool.query(
        `SELECT share_id, title, frames, preferences, created_at
         FROM shared_groups
         WHERE share_id = $1`,
        [shareId]
      );
    } catch (error) {
      // 42703 = undefined_column (older schema without preferences)
      if (error && error.code === "42703") {
        result = await pool.query(
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
      return res.status(404).json({ error: "Group not found" });
    }

    res.json({ success: true, group: result.rows[0] });
  } catch (error) {
    console.error("❌ [Groups] Error fetching group:", error);
    if (error && error.code === "42P01") {
      return res.status(500).json({
        error: "Database schema missing: shared_groups table not found",
      });
    }
    res.status(500).json({ error: "Failed to fetch group" });
  }
});

export default router;
