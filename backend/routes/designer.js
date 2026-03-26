import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "fremio_dev_secret_key";

// Invite code for designer registration — change this in production via env
const DESIGNER_INVITE_CODE =
  process.env.DESIGNER_INVITE_CODE || "fremio-designer-2025";

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres123",
});

// ─────────────────────────────────────────────────
// AUTH: Register as designer (invite-code protected)
// ─────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { email, password, displayName, inviteCode } = req.body;

    if (!email || !password || !inviteCode) {
      return res.status(400).json({
        success: false,
        message: "Email, password, dan invite code diperlukan",
      });
    }

    if (inviteCode !== DESIGNER_INVITE_CODE) {
      return res.status(403).json({
        success: false,
        message: "Invite code tidak valid",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 6 karakter",
      });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, role, is_active)
       VALUES ($1, $2, $3, 'designer', true)
       RETURNING id, email, display_name, role`,
      [
        email.toLowerCase(),
        passwordHash,
        displayName || email.split("@")[0],
      ]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`✅ New designer registered: ${user.email}`);

    res.status(201).json({
      success: true,
      message: "Registrasi berhasil. Selamat datang di Fremio Designer!",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error("Designer register error:", error);
    res.status(500).json({ success: false, message: "Registrasi gagal" });
  }
});

// ─────────────────────────────────────────────────
// AUTH: Login as designer
// ─────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password diperlukan",
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND is_active = true",
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    const user = result.rows[0];

    if (user.role !== "designer" && user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Akun ini bukan akun designer",
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`✅ Designer logged in: ${user.email}`);

    res.json({
      success: true,
      message: "Login berhasil",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error("Designer login error:", error);
    res.status(500).json({ success: false, message: "Login gagal" });
  }
});

// ─────────────────────────────────────────────────
// MIDDLEWARE: Require designer or admin role
// ─────────────────────────────────────────────────
const requireDesigner = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  const role = req.user.role;
  if (role === "designer" || role === "admin") return next();

  try {
    const result = await pool.query(
      "SELECT role FROM users WHERE id = $1",
      [req.user.userId]
    );
    if (
      result.rows.length > 0 &&
      (result.rows[0].role === "designer" || result.rows[0].role === "admin")
    ) {
      req.user.role = result.rows[0].role;
      return next();
    }
  } catch (e) {
    // ignore
  }

  return res.status(403).json({
    success: false,
    message: "Designer access required",
  });
};

// ─────────────────────────────────────────────────
// SUBMISSIONS: Get my submissions
// ─────────────────────────────────────────────────
router.get("/submissions", verifyToken, requireDesigner, async (req, res) => {
  try {
    const designerId = req.user.userId;
    const result = await pool.query(
      `SELECT 
         ds.id, ds.frame_name, ds.frame_description, ds.status,
         ds.admin_notes, ds.submitted_at, ds.reviewed_at,
         ds.thumbnail_data_url,
         f.id AS published_frame_id, f.name AS published_frame_name,
         COALESCE(
           CASE WHEN ds.frame_data IS NOT NULL
                THEN ds.frame_data->>'aspectRatio'
           END,
           '9:16'
         ) AS canvas_aspect_ratio
       FROM designer_submissions ds
       LEFT JOIN frames f ON f.id = ds.published_frame_id
       WHERE ds.designer_id = $1
       ORDER BY ds.submitted_at DESC`,
      [designerId]
    );
    res.json({ success: true, submissions: result.rows });
  } catch (error) {
    console.error("Get submissions error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil data" });
  }
});

// ─────────────────────────────────────────────────
// SUBMISSIONS: Get a single submission by ID
// ─────────────────────────────────────────────────
router.get("/submissions/:id", verifyToken, requireDesigner, async (req, res) => {
  try {
    const { id } = req.params;
    const designerId = req.user.userId;
    const result = await pool.query(
      `SELECT * FROM designer_submissions WHERE id = $1 AND designer_id = $2`,
      [id, designerId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Submission tidak ditemukan" });
    }
    res.json({ success: true, submission: result.rows[0] });
  } catch (error) {
    console.error("Get submission error:", error);
    res.status(500).json({ success: false, message: error.message || "Gagal mengambil data" });
  }
});

// ─────────────────────────────────────────────────
// SUBMISSIONS: Update (re-submit) an existing submission
// ─────────────────────────────────────────────────
router.put("/submissions/:id", verifyToken, requireDesigner, async (req, res) => {
  try {
    const { id } = req.params;
    const designerId = req.user.userId;
    const { frameName, frameDescription, frameData, thumbnailDataUrl } = req.body;

    if (!frameName || !frameData) {
      return res.status(400).json({
        success: false,
        message: "Nama frame dan data frame diperlukan",
      });
    }

    const existing = await pool.query(
      `SELECT designer_id FROM designer_submissions WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Submission tidak ditemukan" });
    }
    if (existing.rows[0].designer_id !== designerId) {
      return res.status(403).json({ success: false, message: "Akses ditolak" });
    }

    const result = await pool.query(
      `UPDATE designer_submissions
         SET frame_name = $1, frame_description = $2, frame_data = $3,
             thumbnail_data_url = $4, status = 'pending', admin_notes = '',
             submitted_at = NOW(), reviewed_at = NULL, reviewed_by = NULL,
             published_frame_id = NULL
       WHERE id = $5
       RETURNING id, frame_name, status, submitted_at`,
      [
        frameName.trim(),
        (frameDescription || "").trim(),
        typeof frameData === "string" ? frameData : JSON.stringify(frameData),
        thumbnailDataUrl || null,
        id,
      ]
    );

    console.log(`✏️ Submission updated: ${frameName} by ${req.user.email}`);
    res.json({
      success: true,
      message: "Frame berhasil diperbarui dan disubmit ulang!",
      submission: result.rows[0],
    });
  } catch (error) {
    console.error("Update submission error:", error);
    res.status(500).json({ success: false, message: error.message || "Gagal update submission" });
  }
});

// ─────────────────────────────────────────────────
// SUBMISSIONS: Submit a new frame for review
// ─────────────────────────────────────────────────
router.post("/submissions", verifyToken, requireDesigner, async (req, res) => {
  try {
    const designerId = req.user.userId;
    const { frameName, frameDescription, frameData, thumbnailDataUrl } = req.body;

    if (!frameName || !frameData) {
      return res.status(400).json({
        success: false,
        message: "Nama frame dan data frame diperlukan",
      });
    }

    const result = await pool.query(
      `INSERT INTO designer_submissions
         (designer_id, frame_name, frame_description, frame_data, thumbnail_data_url, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id, frame_name, status, submitted_at`,
      [
        designerId,
        frameName.trim(),
        (frameDescription || "").trim(),
        typeof frameData === "string" ? frameData : JSON.stringify(frameData),
        thumbnailDataUrl || null,
      ]
    );

    console.log(`📤 New designer submission: ${frameName} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: "Frame berhasil disubmit untuk review!",
      submission: result.rows[0],
    });
  } catch (error) {
    console.error("Submit frame error:", error);
    res.status(500).json({ success: false, message: error.message || "Gagal submit frame" });
  }
});

// ─────────────────────────────────────────────────
// NOTIFICATIONS: Get my notifications
// ─────────────────────────────────────────────────
router.get("/notifications", verifyToken, requireDesigner, async (req, res) => {
  try {
    const designerId = req.user.userId;
    const result = await pool.query(
      `SELECT id, submission_id, type, title, message, is_read, created_at
       FROM designer_notifications
       WHERE designer_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [designerId]
    );
    const unreadCount = result.rows.filter((n) => !n.is_read).length;
    res.json({ success: true, notifications: result.rows, unreadCount });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil notifikasi" });
  }
});

// ─────────────────────────────────────────────────
// NOTIFICATIONS: Mark as read
// ─────────────────────────────────────────────────
router.patch("/notifications/:id/read", verifyToken, requireDesigner, async (req, res) => {
  try {
    const designerId = req.user.userId;
    const { id } = req.params;
    await pool.query(
      `UPDATE designer_notifications SET is_read = true 
       WHERE id = $1 AND designer_id = $2`,
      [id, designerId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal update notifikasi" });
  }
});

// ─────────────────────────────────────────────────
// NOTIFICATIONS: Mark all as read
// ─────────────────────────────────────────────────
router.patch("/notifications/read-all", verifyToken, requireDesigner, async (req, res) => {
  try {
    const designerId = req.user.userId;
    await pool.query(
      `UPDATE designer_notifications SET is_read = true WHERE designer_id = $1`,
      [designerId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal update notifikasi" });
  }
});

// ─────────────────────────────────────────────────
// ADMIN: Get all designer submissions
// ─────────────────────────────────────────────────
router.get("/admin/submissions", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT 
        ds.id, ds.frame_name, ds.frame_description, ds.status,
        ds.admin_notes, ds.submitted_at, ds.reviewed_at, ds.thumbnail_data_url,
        u.email AS designer_email, u.display_name AS designer_name,
        f.id AS published_frame_id, f.name AS published_frame_name
      FROM designer_submissions ds
      JOIN users u ON u.id = ds.designer_id
      LEFT JOIN frames f ON f.id = ds.published_frame_id
    `;
    const params = [];
    if (status) {
      query += ` WHERE ds.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY ds.submitted_at DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, submissions: result.rows });
  } catch (error) {
    console.error("Admin get submissions error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil data" });
  }
});

// ─────────────────────────────────────────────────
// ADMIN: Get single submission with full frame_data
// ─────────────────────────────────────────────────
router.get("/admin/submissions/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ds.*, u.email AS designer_email, u.display_name AS designer_name
       FROM designer_submissions ds
       JOIN users u ON u.id = ds.designer_id
       WHERE ds.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Submission tidak ditemukan" });
    }
    res.json({ success: true, submission: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil data" });
  }
});

// ─────────────────────────────────────────────────
// ADMIN: Review (approve / reject) a submission
// ─────────────────────────────────────────────────
router.patch(
  "/admin/submissions/:id/review",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { id } = req.params;
      const { action, adminNotes, category } = req.body;

      if (!["approved", "rejected"].includes(action)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "action harus 'approved' atau 'rejected'" });
      }

      // Load submission
      const subResult = await client.query(
        `SELECT ds.*, u.email AS designer_email, u.id AS designer_db_id
         FROM designer_submissions ds
         JOIN users u ON u.id = ds.designer_id
         WHERE ds.id = $1`,
        [id]
      );
      if (subResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "Submission tidak ditemukan" });
      }

      const submission = subResult.rows[0];
      let publishedFrameId = null;

      if (action === "approved") {
        // Parse frame data
        let frameData = submission.frame_data;
        if (typeof frameData === "string") {
          try { frameData = JSON.parse(frameData); } catch (e) { frameData = {}; }
        }

        const elements = frameData.elements || [];
        const photoSlots = elements.filter((el) => el.type === "photo");
        const canvasBg = frameData.canvasBackground || frameData.backgroundColor || "#ffffff";
        const canvasW = frameData.canvasWidth || 1080;
        const canvasH = frameData.canvasHeight || 1920;

        // Generate frame ID (frames.id is NOT NULL with no default)
        const frameId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Build slots as JSON array (column type is jsonb)
        const slotsArray = photoSlots.map((el, idx) => ({
          id: el.id || `slot_${idx}`,
          x: el.x || 0,
          y: el.y || 0,
          width: el.width || 300,
          height: el.height || 300,
        }));

        // Strip base64 data from elements to keep layout payload small
        const elementsForLayout = elements.map((el) => {
          if (
            (el.type === "background-photo" || el.type === "upload") &&
            typeof el.data?.image === "string" &&
            el.data.image.startsWith("data:")
          ) {
            return { ...el, data: { ...el.data, image: null } };
          }
          return el;
        });

        // Build layout for frames table
        const layout = {
          elements: elementsForLayout,
          backgroundColor: canvasBg,
          canvasWidth: canvasW,
          canvasHeight: canvasH,
          aspectRatio: frameData.aspectRatio || frameData.canvasAspectRatio || "9:16",
        };

        const frameCategory = category || "Fremio Series";

        // image_path is NOT NULL in frames table; use empty string as fallback
        const imageUrl = submission.thumbnail_data_url || "";

        const frameResult = await client.query(
          `INSERT INTO frames
             (id, name, description, category, image_path, layout, canvas_background,
              canvas_width, canvas_height, slots, max_captures, is_premium,
              is_active, is_hidden, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING id`,
          [
            frameId,
            submission.frame_name,
            submission.frame_description || "",
            frameCategory,
            imageUrl,
            JSON.stringify(layout),
            canvasBg,
            canvasW,
            canvasH,
            JSON.stringify(slotsArray),
            slotsArray.length || 1,
            false,
            true,
            false,
            req.user.userId,
          ]
        );
        publishedFrameId = frameResult.rows[0].id;
      }

      // Update submission status
      await client.query(
        `UPDATE designer_submissions
         SET status = $1, admin_notes = $2, reviewed_by = $3,
             reviewed_at = NOW(), published_frame_id = $4, updated_at = NOW()
         WHERE id = $5`,
        [action, adminNotes || "", req.user.userId, publishedFrameId, id]
      );

      // Create designer notification
      const notifTitle =
        action === "approved"
          ? `✅ Frame "${submission.frame_name}" diterima!`
          : `❌ Frame "${submission.frame_name}" ditolak`;

      const notifMessage =
        action === "approved"
          ? `Frame kamu sudah dipublikasikan di kategori ${req.body.category || "Fremio Series"}!`
          : `Frame kamu belum bisa dipublikasikan.${adminNotes ? ` Catatan admin: ${adminNotes}` : ""}`;

      await client.query(
        `INSERT INTO designer_notifications
           (designer_id, submission_id, type, title, message)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          submission.designer_id,
          id,
          action === "approved" ? "submission_approved" : "submission_rejected",
          notifTitle,
          notifMessage,
        ]
      );

      await client.query("COMMIT");

      console.log(
        `✅ Admin ${action} submission: ${submission.frame_name} by ${submission.designer_email}`
      );

      res.json({
        success: true,
        message: `Frame berhasil ${action === "approved" ? "disetujui" : "ditolak"}`,
        publishedFrameId,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Admin review submission error:", error);
      res.status(500).json({ success: false, message: "Gagal memproses review" });
    } finally {
      client.release();
    }
  }
);

// ─────────────────────────────────────────────────
// ADMIN: List all designers
// ─────────────────────────────────────────────────
router.get("/admin/designers", verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.created_at,
         COUNT(ds.id) AS total_submissions,
         COUNT(ds.id) FILTER (WHERE ds.status = 'pending') AS pending,
         COUNT(ds.id) FILTER (WHERE ds.status = 'approved') AS approved,
         COUNT(ds.id) FILTER (WHERE ds.status = 'rejected') AS rejected
       FROM users u
       LEFT JOIN designer_submissions ds ON ds.designer_id = u.id
       WHERE u.role = 'designer'
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json({ success: true, designers: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil data designer" });
  }
});

export default router;
