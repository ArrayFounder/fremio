import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { verifyToken, requireAdmin } from "../middleware/auth.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import paymentDB from "../services/paymentDatabaseService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Ensure designer tables exist
(async () => {
  // Add is_template and source columns to frames if not present
  try {
    await pool.query(`ALTER TABLE frames ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE frames ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'fremio'`);
    // Back-fill existing frames as fremio source
    await pool.query(`UPDATE frames SET source = 'fremio' WHERE source IS NULL`);
  } catch (_) {}

  try {
    // Migrate designer_feedback if designer_id column is INTEGER (must be UUID)
    try {
      const colType = await pool.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'designer_feedback' AND column_name = 'designer_id'
      `);
      if (colType.rows.length > 0 && colType.rows[0].data_type === 'integer') {
        await pool.query(`DROP TABLE IF EXISTS designer_feedback`);
        console.log("🔄 Dropped old designer_feedback (wrong INTEGER schema), recreating with UUID");
      }
    } catch (migErr) {
      // ignore migration check
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS designer_feedback (
        id SERIAL PRIMARY KEY,
        designer_id UUID NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'general',
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Add is_read column if it doesn't exist (older installs)
    await pool.query(`
      ALTER TABLE designer_feedback ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS designer_agreements (
        id SERIAL PRIMARY KEY,
        designer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tos_version VARCHAR(20) NOT NULL DEFAULT '1.0',
        agreed_at TIMESTAMPTZ DEFAULT NOW(),
        ip_address VARCHAR(64),
        user_agent TEXT
      )
    `);
    console.log("✅ Designer tables ready");
  } catch (e) {
    console.error("⚠️ Designer table init error:", e.message);
  }
})();

// ─────────────────────────────────────────────────
// AUTH: Register as designer (TOS agreement required)
// ─────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { email, password, displayName, tosAgreed } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password diperlukan",
      });
    }

    if (!tosAgreed) {
      return res.status(400).json({
        success: false,
        message: "Kamu harus menyetujui Syarat & Ketentuan untuk mendaftar",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 6 karakter",
      });
    }

    const existing = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    let user;
    let upgraded = false;

    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0];

      // If already a designer or admin, block registration
      if (existingUser.role === "designer" || existingUser.role === "admin") {
        return res.status(409).json({
          success: false,
          message: "Email sudah terdaftar sebagai designer",
        });
      }

      // Existing user account — verify password before upgrading to designer
      const validPassword = await bcrypt.compare(password, existingUser.password_hash);
      if (!validPassword) {
        return res.status(401).json({
          success: false,
          message: "Password salah. Gunakan password akun user kamu yang sudah terdaftar.",
        });
      }

      // Upgrade user role to designer
      const upgradeResult = await pool.query(
        `UPDATE users SET role = 'designer', updated_at = NOW()
         WHERE id = $1
         RETURNING id, email, display_name, role`,
        [existingUser.id]
      );
      user = upgradeResult.rows[0];
      upgraded = true;
      console.log(`⬆️  User upgraded to designer: ${user.email}`);
    } else {
      // New account — create as designer
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
      user = result.rows[0];
    }

    // Record TOS agreement as proof
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS designer_agreements (
          id SERIAL PRIMARY KEY,
          designer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tos_version VARCHAR(20) NOT NULL DEFAULT '1.0',
          agreed_at TIMESTAMPTZ DEFAULT NOW(),
          ip_address VARCHAR(64),
          user_agent TEXT
        )
      `);
      await pool.query(
        `INSERT INTO designer_agreements (designer_id, tos_version, ip_address, user_agent)
         VALUES ($1, $2, $3, $4)`,
        [
          user.id,
          "1.0",
          req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null,
          req.headers["user-agent"] || null,
        ]
      );
      console.log(`📋 TOS agreement recorded for designer ${user.email}`);
    } catch (tosErr) {
      console.error("Failed to record TOS agreement:", tosErr.message);
      // Non-fatal: registration still succeeds
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    if (upgraded) {
      console.log(`⬆️  Designer upgrade complete: ${user.email}`);
    } else {
      console.log(`✅ New designer registered: ${user.email}`);
    }

    res.status(201).json({
      success: true,
      upgraded,
      message: upgraded
        ? "Akun kamu berhasil diupgrade menjadi designer. Selamat datang di Fremio Designer!"
        : "Registrasi berhasil. Selamat datang di Fremio Designer!",
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
    let result;
    const numericId = parseInt(req.user.userId, 10);
    if (!isNaN(numericId)) {
      result = await pool.query("SELECT role FROM users WHERE id = $1", [numericId]);
    } else {
      // Firebase UID — look up by email
      result = await pool.query("SELECT role FROM users WHERE email = $1", [req.user.email]);
    }
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
        f.id AS published_frame_id, f.name AS published_frame_name,
        f.is_active AS frame_is_active
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
      const { action, adminNotes, category, source } = req.body;

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

        const canvasBg = frameData.canvasBackground || frameData.backgroundColor || "#ffffff";
        const canvasW = frameData.canvasWidth || 1080;
        const canvasH = frameData.canvasHeight || 1920;

        // ─── CRITICAL: frame_data structure from DesignerEditor.jsx ───────────
        // frameData.slots     = [{id, left, top, width, height, photoIndex, ...}]
        //                       (normalized 0-1 fractions for photo areas)
        // frameData.elements  = non-photo elements only (upload overlays, text,
        //                       shapes) — NO type:"photo" here!
        // frameData.backgroundImage = server URL/path to background image
        //
        // DO NOT filter elements by type:"photo" — they are not there!
        // ─────────────────────────────────────────────────────────────────────

        // 1. Normalized photo slots (already in the correct format for frameProvider)
        const normalizedSlots = Array.isArray(frameData.slots) ? frameData.slots : [];

        // 2. Reconstruct photo elements (type:"photo") from slots — always zIndex 0
        const photoElements = normalizedSlots.map((slot, idx) => ({
          id: slot.id || `photo_${idx}`,
          type: "photo",
          x: (slot.left || 0) * canvasW,
          y: (slot.top || 0) * canvasH,
          width: (slot.width || 0) * canvasW,
          height: (slot.height || 0) * canvasH,
          zIndex: 0,
          rotation: slot.rotation || 0,
          data: {
            label: "Foto",
            borderRadius: slot.borderRadius || 0,
            photoIndex: slot.photoIndex !== undefined ? slot.photoIndex : idx,
            slotNumber: slot.slotNumber !== undefined ? slot.slotNumber : idx + 1,
            objectFit: "cover",
          },
        }));

        // 3. Non-photo overlay elements — strip any accidental base64
        //    CRITICAL: ensure ALL overlay elements have zIndex >= 100 (always above photo slots at 0)
        const overlayElements = (frameData.elements || []).map((el) => {
          let fixed = el;
          if (
            (el.type === "background-photo" || el.type === "upload") &&
            typeof el.data?.image === "string" &&
            el.data.image.startsWith("data:")
          ) {
            fixed = { ...el, data: { ...el.data, image: null } };
          }
          // Guarantee non-background overlays sit above photo slots
          if (fixed.type !== "background-photo") {
            const safeZ = typeof fixed.zIndex === "number" && fixed.zIndex >= 100
              ? fixed.zIndex
              : Math.max((fixed.zIndex || 0) + 100, 100);
            fixed = { ...fixed, zIndex: safeZ };
          }
          return fixed;
        });

        // 4. Background image element from frameData.backgroundImage
        const bgEl = frameData.backgroundImage
          ? {
              id: "bg-photo-0",
              type: "background-photo",
              x: 0, y: 0,
              width: canvasW, height: canvasH,
              zIndex: 0,
              data: { image: frameData.backgroundImage, objectFit: "cover", label: "Background" },
            }
          : null;

        // 5. Build layout: bg → photo slots → overlay elements
        //    CRITICAL: overlays LAST in DOM so they render on top even with equal z-indices
        const layoutElements = [
          ...(bgEl ? [bgEl] : []),
          ...photoElements,
          ...overlayElements,
        ];

        const layout = {
          elements: layoutElements,
          backgroundColor: canvasBg,
          canvasWidth: canvasW,
          canvasHeight: canvasH,
          aspectRatio: frameData.aspectRatio || frameData.canvasAspectRatio || "9:16",
        };

        const frameCategory = category || null;
        const frameSource = source === 'fremio' ? 'fremio' : 'designer';
        const isTemplate = frameSource === 'designer'; // By Designer = template, By Fremio = siap pakai

        // Save thumbnail_data_url (base64) as a real image file on disk
        let savedImagePath = "";
        if (submission.thumbnail_data_url && submission.thumbnail_data_url.startsWith("data:image/")) {
          try {
            const base64Data = submission.thumbnail_data_url.replace(/^data:image\/\w+;base64,/, "");
            const uploadDir = path.join(__dirname, "../uploads/frames");
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const filename = `designer_${Date.now()}_${Math.random().toString(36).substr(2,6)}.png`;
            fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(base64Data, "base64"));
            savedImagePath = `/uploads/frames/${filename}`;
            console.log(`📸 Saved designer thumbnail: ${filename}`);
          } catch (imgErr) {
            console.error("Failed to save designer thumbnail:", imgErr.message);
          }
        }

        // If this submission was already approved, UPDATE the existing frame record
        // so re-approving fixes previously broken data
        const existingFrameId = submission.published_frame_id;
        if (existingFrameId) {
          await client.query(
            `UPDATE frames
               SET name=$1, description=$2, category=$3, image_path=$4,
                   layout=$5, canvas_background=$6, canvas_width=$7, canvas_height=$8,
                   slots=$9, max_captures=$10, is_active=true,
                   source=$11, is_template=$12,
                   updated_at=NOW()
             WHERE id=$13`,
            [
              submission.frame_name,
              submission.frame_description || "",
              frameCategory,
              savedImagePath || undefined,
              JSON.stringify(layout),
              canvasBg,
              canvasW,
              canvasH,
              JSON.stringify(normalizedSlots),
              normalizedSlots.length || 1,
              frameSource,
              isTemplate,
              existingFrameId,
            ]
          );
          publishedFrameId = existingFrameId;
          console.log(`🔄 Updated existing frame ${existingFrameId} for submission "${submission.frame_name}"`);
        } else {
          // New approval — INSERT frame
          const frameId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const frameResult = await client.query(
            `INSERT INTO frames
               (id, name, description, category, image_path, layout, canvas_background,
                canvas_width, canvas_height, slots, max_captures, is_premium,
                is_active, is_hidden, source, is_template, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             RETURNING id`,
            [
              frameId,
              submission.frame_name,
              submission.frame_description || "",
              frameCategory,
              savedImagePath,
              JSON.stringify(layout),
              canvasBg,
              canvasW,
              canvasH,
              JSON.stringify(normalizedSlots),
              normalizedSlots.length || 1,
              false,
              true,
              false,
              frameSource,
              isTemplate,
              req.user.userId,
            ]
          );
          publishedFrameId = frameResult.rows[0].id;
        }
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
// ADMIN: Takedown a published designer frame (hides from public, keeps data)
// ─────────────────────────────────────────────────
router.patch(
  "/admin/submissions/:id/takedown",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const subResult = await pool.query(
        `SELECT published_frame_id, frame_name FROM designer_submissions WHERE id = $1`,
        [id]
      );
      if (subResult.rows.length === 0)
        return res.status(404).json({ success: false, message: "Submission tidak ditemukan" });
      const { published_frame_id, frame_name } = subResult.rows[0];
      if (!published_frame_id)
        return res.status(400).json({ success: false, message: "Submission belum dipublikasikan" });
      await pool.query(`UPDATE frames SET is_active = false, updated_at = NOW() WHERE id = $1`, [published_frame_id]);
      console.log(`🚫 Takedown frame ${published_frame_id} ("${frame_name}")`);
      res.json({ success: true, message: `Frame "${frame_name}" berhasil di-takedown` });
    } catch (error) {
      console.error("Takedown error:", error);
      res.status(500).json({ success: false, message: "Gagal melakukan takedown" });
    }
  }
);

// ─────────────────────────────────────────────────
// ADMIN: Restore a taken-down designer frame
// ─────────────────────────────────────────────────
router.patch(
  "/admin/submissions/:id/restore",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const subResult = await pool.query(
        `SELECT published_frame_id, frame_name FROM designer_submissions WHERE id = $1`,
        [id]
      );
      if (subResult.rows.length === 0)
        return res.status(404).json({ success: false, message: "Submission tidak ditemukan" });
      const { published_frame_id, frame_name } = subResult.rows[0];
      if (!published_frame_id)
        return res.status(400).json({ success: false, message: "Submission belum dipublikasikan" });
      await pool.query(`UPDATE frames SET is_active = true, updated_at = NOW() WHERE id = $1`, [published_frame_id]);
      console.log(`✅ Restored frame ${published_frame_id} ("${frame_name}")`);
      res.json({ success: true, message: `Frame "${frame_name}" berhasil dipulihkan` });
    } catch (error) {
      console.error("Restore error:", error);
      res.status(500).json({ success: false, message: "Gagal memulihkan frame" });
    }
  }
);

// ─────────────────────────────────────────────────
// ADMIN: Update (republish) frame data from submission without resetting click counts
// ─────────────────────────────────────────────────
router.patch(
  "/admin/submissions/:id/update-frame",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Load submission
      const subResult = await pool.query(
        `SELECT ds.*, u.email AS designer_email
         FROM designer_submissions ds
         JOIN users u ON u.id = ds.designer_id
         WHERE ds.id = $1`,
        [id]
      );
      if (subResult.rows.length === 0)
        return res.status(404).json({ success: false, message: "Submission tidak ditemukan" });

      const submission = subResult.rows[0];
      if (!submission.published_frame_id)
        return res.status(400).json({ success: false, message: "Submission belum dipublikasikan" });

      // Parse frame_data (same logic as approval)
      let frameData = submission.frame_data;
      if (typeof frameData === "string") {
        try { frameData = JSON.parse(frameData); } catch { frameData = {}; }
      }

      const canvasBg = frameData.canvasBackground || frameData.backgroundColor || "#ffffff";
      const canvasW = frameData.canvasWidth || 1080;
      const canvasH = frameData.canvasHeight || 1920;

      const normalizedSlots = Array.isArray(frameData.slots) ? frameData.slots : [];

      const photoElements = normalizedSlots.map((slot, idx) => ({
        id: slot.id || `photo_${idx}`,
        type: "photo",
        x: (slot.left || 0) * canvasW,
        y: (slot.top || 0) * canvasH,
        width: (slot.width || 0) * canvasW,
        height: (slot.height || 0) * canvasH,
        zIndex: 0,
        rotation: slot.rotation || 0,
        data: {
          label: "Foto",
          borderRadius: slot.borderRadius || 0,
          photoIndex: slot.photoIndex !== undefined ? slot.photoIndex : idx,
          slotNumber: slot.slotNumber !== undefined ? slot.slotNumber : idx + 1,
          objectFit: "cover",
        },
      }));

      const overlayElements = (frameData.elements || []).map((el) => {
        let fixed = el;
        if (
          (el.type === "background-photo" || el.type === "upload") &&
          typeof el.data?.image === "string" &&
          el.data.image.startsWith("data:")
        ) {
          fixed = { ...el, data: { ...el.data, image: null } };
        }
        if (fixed.type !== "background-photo") {
          const safeZ = typeof fixed.zIndex === "number" && fixed.zIndex >= 100
            ? fixed.zIndex
            : Math.max((fixed.zIndex || 0) + 100, 100);
          fixed = { ...fixed, zIndex: safeZ };
        }
        return fixed;
      });

      const bgEl = frameData.backgroundImage
        ? {
            id: "bg-photo-0",
            type: "background-photo",
            x: 0, y: 0,
            width: canvasW, height: canvasH,
            zIndex: 0,
            data: { image: frameData.backgroundImage, objectFit: "cover", label: "Background" },
          }
        : null;

      const layoutElements = [
        ...(bgEl ? [bgEl] : []),
        ...photoElements,
        ...overlayElements,
      ];

      const layout = {
        elements: layoutElements,
        backgroundColor: canvasBg,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
        aspectRatio: frameData.aspectRatio || frameData.canvasAspectRatio || "9:16",
      };

      // Save new thumbnail if available
      let savedImagePath = null;
      if (submission.thumbnail_data_url && submission.thumbnail_data_url.startsWith("data:image/")) {
        try {
          const base64Data = submission.thumbnail_data_url.replace(/^data:image\/\w+;base64,/, "");
          const uploadDir = path.join(__dirname, "../uploads/frames");
          if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
          const filename = `designer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.png`;
          fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(base64Data, "base64"));
          savedImagePath = `/uploads/frames/${filename}`;
        } catch (imgErr) {
          console.error("Failed to save thumbnail on update-frame:", imgErr.message);
        }
      }

      // UPDATE frame — preserve view_count, download_count, is_active, is_hidden, category
      // image_path: use new thumbnail if saved, otherwise keep existing value via COALESCE
      await pool.query(
        `UPDATE frames
           SET name=$1, description=$2, layout=$3, canvas_background=$4,
               canvas_width=$5, canvas_height=$6, slots=$7, max_captures=$8,
               image_path=COALESCE($9, image_path),
               is_template=true, updated_at=NOW()
         WHERE id=$10`,
        [
          submission.frame_name,
          submission.frame_description || "",
          JSON.stringify(layout),
          canvasBg,
          canvasW,
          canvasH,
          JSON.stringify(normalizedSlots),
          normalizedSlots.length || 1,
          savedImagePath,
          submission.published_frame_id,
        ]
      );

      console.log(`🔄 Updated frame ${submission.published_frame_id} ("${submission.frame_name}") from submission ${id} — click counts preserved`);
      res.json({ success: true, message: `Frame "${submission.frame_name}" berhasil diperbarui` });
    } catch (error) {
      console.error("Update-frame error:", error);
      res.status(500).json({ success: false, message: "Gagal memperbarui frame" });
    }
  }
);

// ─────────────────────────────────────────────────
// ADMIN: Repair broken designer-approved frames
// Reads frame_data.slots from designer_submissions and rebuilds
// the frames table with correct slots + layout.elements
// ─────────────────────────────────────────────────
router.post("/admin/repair-frames", verifyToken, requireAdmin, async (req, res) => {
  try {
    // Find all approved submissions that have a published_frame_id
    const subResult = await pool.query(
      `SELECT ds.id AS sub_id, ds.frame_name, ds.frame_description,
              ds.frame_data, ds.thumbnail_data_url, ds.published_frame_id,
              f.slots AS current_slots, f.canvas_width, f.canvas_height,
              f.canvas_background, f.category
         FROM designer_submissions ds
         JOIN frames f ON f.id = ds.published_frame_id
        WHERE ds.status = 'approved' AND ds.published_frame_id IS NOT NULL`
    );

    const repaired = [];
    const failed = [];

    for (const sub of subResult.rows) {
      try {
        let frameData = sub.frame_data;
        if (typeof frameData === "string") {
          try { frameData = JSON.parse(frameData); } catch { frameData = {}; }
        }

        // Check if slots already valid
        const currentSlots = Array.isArray(sub.current_slots)
          ? sub.current_slots
          : (typeof sub.current_slots === "string" ? JSON.parse(sub.current_slots) : null);

        const hasValidSlots = Array.isArray(currentSlots) && currentSlots.length > 0 &&
          typeof currentSlots[0] === "object" && ("left" in currentSlots[0] || "top" in currentSlots[0]);

        if (hasValidSlots) {
          continue; // Already good, skip
        }

        const normalizedSlots = Array.isArray(frameData.slots) ? frameData.slots : [];
        if (normalizedSlots.length === 0) {
          failed.push({ id: sub.published_frame_id, name: sub.frame_name, reason: "No slots in frame_data" });
          continue;
        }

        const canvasW = frameData.canvasWidth || sub.canvas_width || 1080;
        const canvasH = frameData.canvasHeight || sub.canvas_height || 1920;
        const canvasBg = frameData.canvasBackground || sub.canvas_background || "#ffffff";

        // Reconstruct photo elements from slots
        // CRITICAL: photo slots always zIndex 0 so overlay elements stay in front
        const photoElements = normalizedSlots.map((slot, idx) => ({
          id: slot.id || `photo_${idx}`,
          type: "photo",
          x: (slot.left || 0) * canvasW,
          y: (slot.top || 0) * canvasH,
          width: (slot.width || 0) * canvasW,
          height: (slot.height || 0) * canvasH,
          zIndex: 0,
          rotation: slot.rotation || 0,
          data: { label: "Foto", borderRadius: slot.borderRadius || 0,
                  photoIndex: slot.photoIndex !== undefined ? slot.photoIndex : idx,
                  slotNumber: slot.slotNumber !== undefined ? slot.slotNumber : idx + 1,
                  objectFit: "cover" },
        }));

        // CRITICAL: ALL overlay elements must have zIndex >= 100 (always above photo slots at 0)
        const overlayElements = (frameData.elements || []).map((el) => {
          let fixed = el;
          if ((el.type === "background-photo" || el.type === "upload") &&
              typeof el.data?.image === "string" && el.data.image.startsWith("data:")) {
            fixed = { ...el, data: { ...el.data, image: null } };
          }
          if (fixed.type !== "background-photo" && fixed.type !== "photo") {
            const safeZ = typeof fixed.zIndex === "number" && fixed.zIndex >= 100
              ? fixed.zIndex
              : Math.max((fixed.zIndex || 0) + 100, 100);
            fixed = { ...fixed, zIndex: safeZ };
          }
          return fixed;
        });

        const bgEl = frameData.backgroundImage
          ? { id: "bg-photo-0", type: "background-photo", x: 0, y: 0,
              width: canvasW, height: canvasH, zIndex: 0,
              data: { image: frameData.backgroundImage, objectFit: "cover", label: "Background" } }
          : null;

        // DOM order: bg → photos → overlays (overlays rendered last = always on top)
        const layoutElements = [...(bgEl ? [bgEl] : []), ...photoElements, ...overlayElements];

        const layout = {
          elements: layoutElements,
          backgroundColor: canvasBg,
          canvasWidth: canvasW,
          canvasHeight: canvasH,
          aspectRatio: frameData.aspectRatio || frameData.canvasAspectRatio || "9:16",
        };

        // Save thumbnail if not already saved
        let imagePath = undefined;
        if (sub.thumbnail_data_url && sub.thumbnail_data_url.startsWith("data:image/")) {
          try {
            const base64Data = sub.thumbnail_data_url.replace(/^data:image\/\w+;base64,/, "");
            const uploadDir = path.join(__dirname, "../uploads/frames");
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const filename = `designer_repair_${sub.published_frame_id}.png`;
            fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(base64Data, "base64"));
            imagePath = `/uploads/frames/${filename}`;
          } catch { /* keep undefined */ }
        }

        const updateQuery = imagePath
          ? `UPDATE frames SET slots=$1, layout=$2, canvas_width=$3, canvas_height=$4,
                               canvas_background=$5, max_captures=$6, image_path=$7,
                               updated_at=NOW() WHERE id=$8`
          : `UPDATE frames SET slots=$1, layout=$2, canvas_width=$3, canvas_height=$4,
                               canvas_background=$5, max_captures=$6, updated_at=NOW() WHERE id=$7`;

        const updateParams = imagePath
          ? [JSON.stringify(normalizedSlots), JSON.stringify(layout), canvasW, canvasH,
             canvasBg, normalizedSlots.length, imagePath, sub.published_frame_id]
          : [JSON.stringify(normalizedSlots), JSON.stringify(layout), canvasW, canvasH,
             canvasBg, normalizedSlots.length, sub.published_frame_id];

        await pool.query(updateQuery, updateParams);
        repaired.push({ id: sub.published_frame_id, name: sub.frame_name, slots: normalizedSlots.length });
        console.log(`🔧 Repaired frame: ${sub.frame_name} (${sub.published_frame_id}) — ${normalizedSlots.length} slots`);
      } catch (err) {
        failed.push({ id: sub.published_frame_id, name: sub.frame_name, reason: err.message });
      }
    }

    res.json({
      success: true,
      message: `Repaired ${repaired.length} frame(s). ${failed.length} failed.`,
      repaired,
      failed,
    });
  } catch (error) {
    console.error("Repair frames error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────
// CERTIFICATE CLAIM
// ─────────────────────────────────────────────────

// Ensure certificate column exists
async function ensureCertificateColumns() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS certificate_name TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS certificate_claimed_at TIMESTAMPTZ`);
  } catch (_) {}
}
ensureCertificateColumns();

// POST /api/designer/certificate-claim — designer submits their full name for certificate
router.post("/certificate-claim", verifyToken, requireDesigner, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { fullName } = req.body;

    if (!fullName || fullName.trim().length < 2) {
      return res.status(400).json({ success: false, message: "Nama lengkap minimal 2 karakter" });
    }

    // Verify designer has >= 2 approved submissions
    const countResult = await pool.query(
      `SELECT COUNT(*) AS cnt FROM designer_submissions WHERE designer_id = $1 AND status = 'approved'`,
      [userId]
    );
    const approvedCount = parseInt(countResult.rows[0]?.cnt || 0, 10);
    if (approvedCount < 2) {
      return res.status(403).json({ success: false, message: "Kamu perlu minimal 2 frame yang disetujui untuk mengklaim sertifikat" });
    }

    await pool.query(
      `UPDATE users SET certificate_name = $1, certificate_claimed_at = NOW() WHERE id = $2`,
      [fullName.trim(), userId]
    );

    res.json({ success: true, message: "Nama sertifikat berhasil disimpan!" });
  } catch (error) {
    console.error("Certificate claim error:", error);
    res.status(500).json({ success: false, message: "Gagal menyimpan nama sertifikat" });
  }
});

// GET /api/designer/certificate-status — check if designer has already claimed
router.get("/certificate-status", verifyToken, requireDesigner, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const result = await pool.query(
      `SELECT certificate_name, certificate_claimed_at FROM users WHERE id = $1`,
      [userId]
    );
    const row = result.rows[0] || {};
    res.json({ success: true, certificate_name: row.certificate_name || null, certificate_claimed_at: row.certificate_claimed_at || null });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil status sertifikat" });
  }
});

// ─────────────────────────────────────────────────
// FEEDBACK: Submit designer feedback / complaint
// ─────────────────────────────────────────────────
router.post("/feedback", verifyToken, requireDesigner, async (req, res) => {
  try {
    const { type, message } = req.body;

    if (!message || message.trim().length < 10) {
      return res.status(400).json({ success: false, message: "Pesan minimal 10 karakter" });
    }

    const allowedTypes = ["bug", "suggestion", "editor", "general"];
    const feedbackType = allowedTypes.includes(type) ? type : "general";

    // Use UUID user ID directly (users.id is UUID, not integer)
    let designerId = req.user.userId;
    if (!designerId) {
      const lookup = await pool.query("SELECT id FROM users WHERE email = $1", [req.user.email]);
      if (lookup.rows.length === 0) {
        return res.status(404).json({ success: false, message: "User tidak ditemukan" });
      }
      designerId = lookup.rows[0].id;
    }

    // Ensure table exists with correct UUID schema (fallback if IIFE failed at startup)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS designer_feedback (
        id SERIAL PRIMARY KEY,
        designer_id UUID NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'general',
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE designer_feedback ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false`);

    await pool.query(
      `INSERT INTO designer_feedback (designer_id, type, message) VALUES ($1, $2, $3)`,
      [designerId, feedbackType, message.trim()]
    );

    console.log(`📬 Feedback from designer ${designerId} (${req.user.email}): [${feedbackType}]`);
    res.json({ success: true, message: "Terima kasih! Masukan kamu sudah kami terima." });
  } catch (error) {
    console.error("Feedback error:", error.message, error.code);
    res.status(500).json({ success: false, message: `Gagal mengirim masukan: ${error.message}` });
  }
});

// ─────────────────────────────────────────────────
// ADMIN: List designer feedback
// ─────────────────────────────────────────────────
router.get("/admin/feedback", verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT df.id, df.designer_id::text AS designer_id, df.type, df.message, df.is_read, df.submitted_at,
              u.email AS designer_email, u.display_name AS designer_name
       FROM designer_feedback df
       LEFT JOIN users u ON u.id::text = df.designer_id::text
       ORDER BY df.submitted_at DESC`
    );
    res.json({ success: true, feedback: result.rows });
  } catch (error) {
    console.error("Get feedback error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil data: " + error.message });
  }
});

// ─────────────────────────────────────────────────
// ADMIN: Mark feedback as read
// ─────────────────────────────────────────────────
router.patch("/admin/feedback/:id/read", verifyToken, requireAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE designer_feedback SET is_read = true WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────────
// ADMIN: List all designers
// ─────────────────────────────────────────────────
router.get("/admin/designers", verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.created_at,
         u.certificate_name, u.certificate_claimed_at,
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

// GET /api/designer/admin/designers-wallet — designer list with wallet info
router.get("/admin/designers-wallet", verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.dana_number, u.gopay_number, u.created_at,
         COUNT(ds.id) AS total_submissions,
         COUNT(ds.id) FILTER (WHERE ds.status = 'approved') AS approved_submissions
       FROM users u
       LEFT JOIN designer_submissions ds ON ds.designer_id = u.id
       WHERE u.role = 'designer'
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json({ success: true, designers: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil data wallet designer" });
  }
});

// ─── PROFILE ─────────────────────────────────────────────────────────────────

// Multer for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/avatars");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `avatar_${req.user.userId || req.user.id}_${Date.now()}${ext}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

// Ensure photo_url column exists
async function ensurePhotoUrlColumn() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT`);
  } catch (_) {}
}
ensurePhotoUrlColumn();

// GET /api/designer/profile
router.get("/profile", verifyToken, requireDesigner, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const result = await pool.query(
      "SELECT id, email, display_name, photo_url, created_at FROM users WHERE id = $1",
      [userId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "User not found" });
    const u = result.rows[0];
    res.json({
      success: true,
      displayName: u.display_name,
      email: u.email,
      photoURL: u.photo_url || null,
      createdAt: u.created_at,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal mengambil profil" });
  }
});

// PUT /api/designer/profile
router.put("/profile", verifyToken, requireDesigner, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { displayName } = req.body;
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ success: false, message: "Nama tidak boleh kosong" });
    }
    await pool.query(
      "UPDATE users SET display_name = $1, updated_at = NOW() WHERE id = $2",
      [displayName.trim(), userId]
    );
    res.json({ success: true, displayName: displayName.trim() });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal menyimpan nama" });
  }
});

// POST /api/designer/profile/avatar
router.post("/profile/avatar", verifyToken, requireDesigner, avatarUpload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    const userId = req.user.userId || req.user.id;
    const photoURL = `/uploads/avatars/${req.file.filename}`;

    // Delete old avatar file if exists
    const old = await pool.query("SELECT photo_url FROM users WHERE id = $1", [userId]);
    if (old.rows[0]?.photo_url) {
      const oldPath = path.join(__dirname, "..", old.rows[0].photo_url);
      if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
    }

    await pool.query(
      "UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2",
      [photoURL, userId]
    );
    res.json({ success: true, photoURL });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal upload foto" });
  }
});

// ─── PUBLIC TEMPLATES ────────────────────────────────────────────────────────

// GET /api/designer/templates — public endpoint, returns is_template=true designer frames
// Premium templates are returned with redacted slots/layout if user has no access.
router.get("/templates", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, category, image_path, layout, canvas_background,
              canvas_width, canvas_height, slots, max_captures, is_premium, source
       FROM frames
       WHERE is_active = true AND is_hidden = false AND is_template = true AND source = 'designer'
       ORDER BY COALESCE(display_order, 999999) ASC, created_at DESC, id ASC`
    );

    // Resolve user access for premium redaction (optional auth — not required)
    let accessibleSet = new Set();
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
        const userId = decoded.userId || decoded.id || decoded.uid;
        if (userId) {
          const frameIds = await paymentDB.getUserAccessibleFrames(String(userId));
          accessibleSet = new Set((frameIds || []).map((id) => String(id)));
        }
      } catch (_) {
        // Invalid or expired token — treat as unauthenticated
      }
    }

    const templates = result.rows.map((tmpl) => {
      const isPremium = !!tmpl.is_premium;
      // getUserAccessibleFrames already returns all premium frame IDs for subscribed users
      const canSeePremiumDetails = !isPremium || accessibleSet.has(String(tmpl.id));

      let slots = tmpl.slots;
      let layout = tmpl.layout;
      if (!canSeePremiumDetails) {
        slots = [];
        try {
          const layoutParsed = typeof layout === "string" ? JSON.parse(layout) : (layout || {});
          layout = { ...layoutParsed, elements: [] };
        } catch (_) {
          layout = { elements: [] };
        }
      }

      return {
        ...tmpl,
        slots,
        layout,
        isLocked: !canSeePremiumDetails,
      };
    });

    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal mengambil templates" });
  }
});

// ─── WALLET ──────────────────────────────────────────────────────────────────

// Ensure wallet columns exist
async function ensureWalletColumns() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dana_number TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gopay_number TEXT`);
  } catch (_) {}
}
ensureWalletColumns();

// GET /api/designer/wallet
router.get("/wallet", verifyToken, requireDesigner, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const result = await pool.query(
      "SELECT dana_number, gopay_number FROM users WHERE id = $1",
      [userId]
    );
    const u = result.rows[0] || {};
    res.json({ success: true, dana_number: u.dana_number || "", gopay_number: u.gopay_number || "" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal mengambil data wallet" });
  }
});

// PUT /api/designer/wallet
router.put("/wallet", verifyToken, requireDesigner, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { dana_number, gopay_number } = req.body;
    await pool.query(
      "UPDATE users SET dana_number = $1, gopay_number = $2, updated_at = NOW() WHERE id = $3",
      [dana_number || null, gopay_number || null, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal menyimpan wallet" });
  }
});

export default router;
