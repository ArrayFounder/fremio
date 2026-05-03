import express from "express";
import { body, query } from "express-validator";
import { getFirestore } from "../config/firebase.js";
import {
  verifyToken,
  requireAdmin,
  requireKreator,
  optionalAuth,
} from "../middleware/auth.js";
import validate from "../middleware/validator.js";
import { uploadImage, handleUploadError } from "../middleware/upload.js";
import storageService from "../services/storageService.js";
import paymentDB from "../services/paymentDatabaseService.js";
import pg from "pg";

const router = express.Router();

/**
 * Normalize slots: ensure it's always an array with left/top/width/height fractions.
 * Designer-approved frames stored slots as an integer (e.g. 4) with the old code;
 * derive proper normalized slots from layout.elements photo types in that case.
 */
function normalizeSlots(rawSlots, layoutRaw, canvasW, canvasH) {
  const parsed = Array.isArray(rawSlots) ? rawSlots : [];
  if (parsed.length > 0) return parsed;

  const directLayoutSlots =
    (Array.isArray(layoutRaw?.photoAreas) && layoutRaw.photoAreas) ||
    (Array.isArray(layoutRaw?.photoSlots) && layoutRaw.photoSlots) ||
    (Array.isArray(layoutRaw?.slots) && layoutRaw.slots) ||
    [];
  if (directLayoutSlots.length > 0) return directLayoutSlots;

  // Try to derive from layout.elements photo elements
  const elements = layoutRaw?.elements;
  if (!Array.isArray(elements)) return parsed;
  const photoEls = elements.filter((el) => el && el.type === "photo");
  if (photoEls.length === 0) return parsed;
  const cW = canvasW || 1080;
  const cH = canvasH || 1920;
  return photoEls.map((el, idx) => ({
    id: el.id || `slot_${idx}`,
    left: (el.x || 0) / cW,
    top: (el.y || 0) / cH,
    width: (el.width || 300) / cW,
    height: (el.height || 300) / cH,
    photoIndex: el.data?.photoIndex ?? idx,
    rotation: el.rotation || 0,
    borderRadius: el.data?.borderRadius || el.borderRadius || 0,
    zIndex: el.zIndex || 2,
    aspectRatio: el.data?.aspectRatio || "4:5",
  }));
}

const toFiniteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const sortByTopThenLeft = (a, b) => {
  if (Math.abs(a.top - b.top) > 0.0001) return a.top - b.top;
  return a.left - b.left;
};

const normalizeSlotsAndMode = (slots) => {
  const sourceSlots = Array.isArray(slots) ? slots : [];
  const geometry = sourceSlots
    .map((slot, index) => {
      const left = toFiniteNumber(slot?.left, 0);
      const top = toFiniteNumber(slot?.top, 0);
      const width = toFiniteNumber(slot?.width, 0);
      const height = toFiniteNumber(slot?.height, 0);
      return {
        index,
        left,
        top,
        width,
        height,
        right: left + width,
      };
    })
    .filter((slot) => slot.width > 0 && slot.height > 0);

  const slotNumberMap = {};
  const photoIndexMap = {};

  const crossesCenter = geometry.some(
    (slot) => slot.left < 0.5 && slot.right > 0.5
  );
  const leftSlots = geometry.filter((slot) => slot.right <= 0.5);
  const rightSlots = geometry.filter((slot) => slot.left >= 0.5);

  const isDuplicateMode =
    !crossesCenter &&
    leftSlots.length > 0 &&
    leftSlots.length === rightSlots.length &&
    leftSlots.length + rightSlots.length === geometry.length;

  if (isDuplicateMode) {
    leftSlots.sort(sortByTopThenLeft);
    rightSlots.sort(sortByTopThenLeft);
    const rows = leftSlots.length;

    leftSlots.forEach((slot, idx) => {
      slotNumberMap[slot.index] = idx + 1;
      photoIndexMap[slot.index] = idx;
    });

    rightSlots.forEach((slot, idx) => {
      const displayNumber = rows - idx;
      slotNumberMap[slot.index] = displayNumber;
      photoIndexMap[slot.index] = displayNumber - 1;
    });
  } else {
    [...geometry].sort(sortByTopThenLeft).forEach((slot, idx) => {
      slotNumberMap[slot.index] = idx + 1;
      photoIndexMap[slot.index] = idx;
    });
  }

  const normalizedSlots = sourceSlots.map((slot, index) => ({
    ...slot,
    slotNumber: slotNumberMap[index] ?? index + 1,
    photoIndex: photoIndexMap[index] ?? index,
  }));

  return {
    slots: normalizedSlots,
    duplicatePhotos: isDuplicateMode,
    captureMode: isDuplicateMode ? "duplicate" : "single",
  };
};

/** Resolve image path: handle base64 data URLs, absolute HTTP URLs, and relative paths */
function resolveImageUrl(imagePath, baseUrl) {
  if (!imagePath) return null;
  if (imagePath.startsWith("data:")) return imagePath; // base64, use as-is
  if (imagePath.startsWith("http")) return imagePath;
  return `${baseUrl}${imagePath}`;
}

const resolvePublicBaseUrl = (req) => {
  const explicit = String(process.env.PUBLIC_BASE_URL || "").trim();
  const host = String(req.get("host") || "").trim();
  const base = explicit || `${req.protocol}://${host}`;

  // Avoid mixed-content when frontend is HTTPS (Cloudflare Pages)
  if (base.startsWith("http://") && /(^|\.)fremio\.id$/i.test(host)) {
    return base.replace("http://", "https://");
  }
  return base;
};

// PostgreSQL pool for VPS mode
const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "salwa",
  password: process.env.DB_PASSWORD || "",
});

const isIncludeHiddenRequested = (value) => {
  const normalized = String(value || "").toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const isAdminForRequest = async (req) => {
  if (!req?.user) return false;

  if (req.user.role === "admin") return true;

  const userId = req.user.userId || req.user.uid || req.user.id;
  const email = req.user.email;

  // Prefer PostgreSQL role lookup when available
  try {
    if (userId || email) {
      const result = await pool.query(
        "SELECT role FROM users WHERE (id = $1) OR (email = $2) LIMIT 1",
        [userId || null, email || null]
      );
      if (result.rows?.[0]?.role === "admin") {
        req.user.role = "admin";
        return true;
      }
    }
  } catch (e) {
    // Ignore DB lookup errors and fallback below
  }

  // Fallback: Firestore role lookup (for Firebase-auth users)
  try {
    const firestore = getFirestore();
    if (firestore) {
      const docId = req.user.uid || userId;
      if (docId) {
        const userDoc = await firestore
          .collection("users")
          .doc(String(docId))
          .get();
        if (userDoc.exists && userDoc.data()?.role === "admin") {
          req.user.role = "admin";
          return true;
        }
      }
    }
  } catch (e) {
    // Ignore Firestore errors
  }

  return false;
};

/**
 * GET /api/frames
 * Get all public frames with pagination and filtering
 */
/**
 * GET /api/frames
 * Get all frames with pagination (uses PostgreSQL)
 */
router.get("/", optionalAuth, async (req, res) => {
  try {
    const publicBaseUrl = resolvePublicBaseUrl(req);

    // Prevent stale lists when frames are hidden/unhidden
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    const page = parseInt(req.query.page) || 1;
    const category = req.query.category;
    const source = typeof req.query.source === "string" ? req.query.source.trim().toLowerCase() : "";
    const includeHidden = isIncludeHiddenRequested(req.query.includeHidden);
    const allowHidden = includeHidden ? await isAdminForRequest(req) : false;

    // Public endpoints default to 50 for performance, but admin screens must not be capped.
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : allowHidden
        ? null
        : 50;

    const offset = limit ? (page - 1) * limit : 0;

    // Determine user access for premium frames (for redaction)
    let accessibleSet = new Set();
    if (!allowHidden && req.user) {
      const userId = req.user?.uid || req.user?.userId || req.user?.id;
      if (userId) {
        try {
          const accessibleFrameIds = await paymentDB.getUserAccessibleFrames(
            String(userId)
          );
          accessibleSet = new Set(
            (accessibleFrameIds || []).map((id) => String(id))
          );
        } catch (e) {
          // If payment DB is unavailable, default to least-privilege
          accessibleSet = new Set();
        }
      }
    }

    let queryText = `
        SELECT id, name, description, category, image_path, thumbnail_path, 
               slots, max_captures, is_premium, is_active, view_count, 
               download_count, created_by, created_at, updated_at,
         layout, canvas_background, canvas_width, canvas_height, display_order, is_hidden, flow_type,
         source, is_template
        FROM frames 
        WHERE is_active = true
      `;

    if (!allowHidden) {
      queryText += ` AND is_hidden = false`;
    }
    const queryParams = [];
    let paramIndex = 1;

    if (category) {
      queryText += ` AND category = $${paramIndex}`;
      queryParams.push(category);
      paramIndex++;
    }

    if (source) {
      if (source === "studio_booth") {
        queryText += ` AND (source = $${paramIndex} OR is_template = true)`;
        queryParams.push(source);
      } else {
        queryText += ` AND source = $${paramIndex}`;
        queryParams.push(source);
      }
      paramIndex++;
<<<<<<< HEAD
=======
    } else {
      // Public endpoint: exclude admin-only frames (studio_booth and designer) unless explicitly requested
      queryText += ` AND (source IS NULL OR (source != 'studio_booth' AND source != 'designer'))`;
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
    }

    // Deterministic ordering avoids "random" disappearance when paging/limits apply
    queryText += ` ORDER BY COALESCE(display_order, 999999) ASC, created_at DESC, id ASC`;
    
    // Only apply LIMIT/OFFSET when we have a limit.
    if (limit) {
      queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(limit, offset);
      paramIndex += 2;
    }

    let result;
    let total = 0;
    let useMockData = false;

    try {
      result = await pool.query(queryText, queryParams);

      // Get total count
      let countQuery = "SELECT COUNT(*) FROM frames WHERE is_active = true";
      if (!allowHidden) {
        countQuery += " AND is_hidden = false";
      }
      const countParams = [];
      if (category) {
        countQuery += " AND category = $1";
        countParams.push(category);
      }
      if (source) {
        if (source === "studio_booth") {
          countQuery += ` AND (source = $${countParams.length + 1} OR is_template = true)`;
          countParams.push(source);
        } else {
          countQuery += ` AND source = $${countParams.length + 1}`;
          countParams.push(source);
        }
<<<<<<< HEAD
=======
      } else {
        // Public endpoint: exclude admin-only frames from count
        countQuery += ` AND (source IS NULL OR (source != 'studio_booth' AND source != 'designer'))`;
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
      }
      const countResult = await pool.query(countQuery, countParams);
      total = parseInt(countResult.rows[0].count);
    } catch (dbError) {
      console.log(
        "⚠️  Database connection failed for frames, using mock premium frames"
      );
      // Return mock frames with premium examples when database is down
      useMockData = true;
      result = {
        rows: [
          // Mock Premium Frame 1 - Christmas Series
          {
            id: "premium-frame-001",
            name: "Golden Christmas Frame",
            description:
              "Frame Natal premium dengan efek emas - Harus bayar untuk unlock",
            category: "Christmas Fremio Series",
            image_path: "/mock-frames/golden-christmas.png",
            thumbnail_path: "/mock-frames/golden-christmas-thumb.png",
            slots: "[]", // Locked
            max_captures: 4,
            is_premium: true,
            is_active: true,
            is_hidden: false,
            view_count: 0,
            download_count: 0,
            created_at: new Date(),
            updated_at: new Date(),
            layout: JSON.stringify({
              aspectRatio: "9:16",
              orientation: "portrait",
              backgroundColor: "#FFD700",
              elements: [],
            }),
            canvas_background: "#FFD700",
            canvas_width: 1080,
            canvas_height: 1920,
            display_order: 1,
          },
          // Mock Premium Frame 2 - Holiday Series
          {
            id: "premium-frame-002",
            name: "Holiday Celebration Frame",
            description: "Frame liburan mewah - Premium locked",
            category: "Holiday Fremio Series",
            image_path: "/mock-frames/holiday-celebration.png",
            thumbnail_path: "/mock-frames/holiday-celebration-thumb.png",
            slots: "[]",
            max_captures: 6,
            is_premium: true,
            is_active: true,
            is_hidden: false,
            view_count: 0,
            download_count: 0,
            created_at: new Date(),
            updated_at: new Date(),
            layout: JSON.stringify({
              aspectRatio: "9:16",
              orientation: "portrait",
              backgroundColor: "#E8E8E8",
              elements: [],
            }),
            canvas_background: "#E8E8E8",
            canvas_width: 1080,
            canvas_height: 1920,
            display_order: 2,
          },
          // Mock Premium Frame 3 - Year-End Recap
          {
            id: "premium-frame-003",
            name: "Year-End Recap 2025",
            description: "Frame recap akhir tahun - Premium locked",
            category: "Year-End Recap Fremio Series",
            category: "Year-End Recap Fremio Series",
            image_path: "/mock-frames/year-end-recap.png",
            thumbnail_path: "/mock-frames/year-end-recap-thumb.png",
            slots: "[]",
            max_captures: 6,
            is_premium: true,
            is_active: true,
            is_hidden: false,
            view_count: 0,
            download_count: 0,
            created_at: new Date(),
            updated_at: new Date(),
            layout: JSON.stringify({
              aspectRatio: "9:16",
              orientation: "portrait",
              backgroundColor: "#4A5568",
              elements: [],
            }),
            canvas_background: "#4A5568",
            canvas_width: 1080,
            canvas_height: 1920,
            display_order: 3,
          },
          // Mock Free Frame - Christmas (for testing unlock)
          {
            id: "free-frame-001",
            name: "Simple Christmas Collage",
            description: "Frame gratis untuk testing - Sudah unlocked",
            category: "Christmas Fremio Series",
            name: "Simple Christmas Collage",
            description: "Frame gratis untuk testing - Sudah unlocked",
            category: "Christmas Fremio Series",
            image_path: "/mock-frames/simple-christmas.png",
            thumbnail_path: "/mock-frames/simple-christmas-thumb.png",
            slots: JSON.stringify([
              { x: 100, y: 100, width: 200, height: 200, type: "photo" },
              { x: 350, y: 100, width: 200, height: 200, type: "photo" },
              { x: 100, y: 350, width: 200, height: 200, type: "photo" },
              { x: 350, y: 350, width: 200, height: 200, type: "photo" },
            ]),
            max_captures: 4,
            is_premium: false,
            is_active: true,
            is_hidden: false,
            view_count: 0,
            download_count: 0,
            created_at: new Date(),
            updated_at: new Date(),
            layout: JSON.stringify({
              aspectRatio: "1:1",
              orientation: "square",
              backgroundColor: "#C53030",
              elements: [],
            }),
            canvas_background: "#C53030",
            canvas_width: 1080,
            canvas_height: 1080,
            display_order: 4,
          },
        ],
      };
      total = result.rows.length;
    }

    // Format frames for response
    const allowStudioBoothDetails = source === "studio_booth";

    const frames = result.rows.map((frame) => {
      const isPremium = !!frame.is_premium;
      const canSeePremiumDetails =
        allowStudioBoothDetails || allowHidden || !isPremium || accessibleSet.has(String(frame.id));

      const rawSlotsValue =
        typeof frame.slots === "string"
          ? JSON.parse(frame.slots)
          : frame.slots;
      const layoutRaw =
        typeof frame.layout === "string"
          ? JSON.parse(frame.layout)
          : frame.layout || {};
      const derivedSlots = normalizeSlots(
        rawSlotsValue, layoutRaw, frame.canvas_width, frame.canvas_height
      );
      const slotMeta = normalizeSlotsAndMode(derivedSlots);

      // IMPORTANT: Prevent premium frames from being usable without access.
      // We still allow preview (name + thumbnail), but redact slots/layout elements.
      const slots = canSeePremiumDetails ? slotMeta.slots : [];
      const layout = canSeePremiumDetails
        ? layoutRaw
        : {
            ...(layoutRaw || {}),
            elements: [],
          };
      // Construct full URL for images
      const baseUrl = publicBaseUrl;
      const imageUrl = resolveImageUrl(frame.image_path, baseUrl);
      const thumbnailUrl = resolveImageUrl(
        frame.thumbnail_path || frame.image_path, baseUrl
      );

      return {
        id: frame.id,
        name: frame.name,
        description: frame.description,
        category: frame.category,
        imagePath: frame.image_path || null,
        imageUrl: imageUrl,
        thumbnailUrl: thumbnailUrl,
        slots: slots,
        maxCaptures: frame.max_captures || derivedSlots.length || 1,
        duplicatePhotos: slotMeta.duplicatePhotos,
        captureMode: slotMeta.captureMode,
        isPremium: isPremium,
        isLocked: isPremium && !canSeePremiumDetails,
        isActive: frame.is_active,
        // Visibility (for admin UI and defensive client filtering)
        isHidden: frame.is_hidden,
        is_hidden: frame.is_hidden,
        viewCount: frame.view_count,
        downloadCount: frame.download_count,
        createdBy: frame.created_by,
        createdAt: frame.created_at,
        updatedAt: frame.updated_at,
        displayOrder: frame.display_order ?? 999,
        flowType: frame.flow_type || "fixed",
        // Include layout with elements for overlay/background
        layout: {
          aspectRatio: layout.aspectRatio || "9:16",
          orientation: layout.orientation || "portrait",
          backgroundColor:
            frame.canvas_background || layout.backgroundColor || "#ffffff",
          elements: layout.elements || [],
        },
        canvasBackground: frame.canvas_background || "#ffffff",
        canvasWidth: frame.canvas_width || 1080,
        canvasHeight: frame.canvas_height || 1920,
        source: frame.source || null,
        isTemplate: frame.is_template || false,
        is_template: frame.is_template || false,
        isCustom: true,
      };
    });

    res.json({
      success: true,
      frames,
      pagination: {
        page,
        limit,
        total,
        totalPages: limit ? Math.ceil(total / limit) : 1,
      },
    });
  } catch (error) {
    console.error("Get frames error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get frames",
    });
  }
});

/**
 * POST /api/frames/:id/view
 * Increment view/click count for a frame (lightweight, no auth required)
 */
router.post("/:id/view", async (req, res) => {
  try {
    await pool.query(
      `UPDATE frames SET view_count = view_count + 1 WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Increment view_count error:", error);
    res.status(500).json({ success: false });
  }
});

/**
 * GET /api/frames/:id
 * Get single frame by ID (PostgreSQL)
 */
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const publicBaseUrl = resolvePublicBaseUrl(req);
    const result = await pool.query(`SELECT * FROM frames WHERE id = $1`, [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Frame not found",
      });
    }

    const frame = result.rows[0];

    // If premium, require access to return full details.
    // For locked users, return 403 with minimal preview so frontend can redirect.
    if (frame.is_premium) {
      const isAdmin = await isAdminForRequest(req);
      if (!isAdmin) {
        const userId = req.user?.uid || req.user?.userId || req.user?.id;
        const accessibleFrameIds = userId
          ? await paymentDB
              .getUserAccessibleFrames(String(userId))
              .catch(() => [])
          : [];
        const allowed = new Set(
          (accessibleFrameIds || []).map((id) => String(id))
        );
        if (!allowed.has(String(frame.id))) {
          return res.status(403).json({
            success: false,
            message: "Premium frame: akses diperlukan",
            redirect: "/pricing",
            frame: {
              id: frame.id,
              name: frame.name,
              category: frame.category,
              isPremium: true,
              imageUrl: frame.image_path?.startsWith("http")
                ? frame.image_path
                : `${publicBaseUrl}${frame.image_path}`,
              thumbnailUrl: (
                frame.thumbnail_path || frame.image_path
              )?.startsWith("http")
                ? frame.thumbnail_path || frame.image_path
                : `${publicBaseUrl}${frame.thumbnail_path || frame.image_path}`,
            },
          });
        }
      }
    }

    // Increment view count
    await pool.query(
      `UPDATE frames SET view_count = view_count + 1 WHERE id = $1`,
      [req.params.id]
    );

    const normalizeUploads = (value) => {
      if (typeof value !== "string" || value.length === 0) return value;
      if (value.startsWith("data:")) return value;
      // Strip internal localhost URLs (e.g. http://localhost:5050/uploads/...) → relative path
      const localhostMatch = value.match(/^https?:\/\/localhost:\d+(\/uploads\/.+)$/);
      if (localhostMatch) return `${publicBaseUrl}${localhostMatch[1]}`;
      if (value.startsWith("https://")) return value;
      if (value.startsWith("http://")) return value.replace("http://", "https://");
      if (value.startsWith("/uploads/")) return `${publicBaseUrl}${value}`;
      return value;
    };

    const parsedLayout =
      typeof frame.layout === "string" ? JSON.parse(frame.layout) : frame.layout;
    const normalizedLayout =
      parsedLayout && typeof parsedLayout === "object"
        ? {
            ...parsedLayout,
            elements: Array.isArray(parsedLayout.elements)
              ? parsedLayout.elements.map((el) => {
                  if (!el || typeof el !== "object") return el;
                  const data = el.data && typeof el.data === "object" ? el.data : null;
                  if (!data) return el;
                  return {
                    ...el,
                    data: {
                      ...data,
                      image: normalizeUploads(data.image),
                      originalImage: normalizeUploads(data.originalImage),
                    },
                  };
                })
              : parsedLayout.elements,
          }
        : parsedLayout;

    const normalizedSlots = normalizeSlots(
      typeof frame.slots === "string" ? JSON.parse(frame.slots) : frame.slots,
      normalizedLayout,
      frame.canvas_width,
      frame.canvas_height
    );
    const slotMeta = normalizeSlotsAndMode(normalizedSlots);

    res.json({
      success: true,
      frame: {
        id: frame.id,
        name: frame.name,
        description: frame.description,
        category: frame.category,
        flowType: frame.flow_type || "fixed",
        imagePath: frame.image_path,
        // Construct full URL for images
        imageUrl: frame.image_path?.startsWith("http")
          ? frame.image_path
          : `${publicBaseUrl}${frame.image_path}`,
        slots: slotMeta.slots,
        layout: normalizedLayout,
        canvasBackground: frame.canvas_background,
        canvasWidth: frame.canvas_width,
        canvasHeight: frame.canvas_height,
        maxCaptures: frame.max_captures,
        duplicatePhotos: slotMeta.duplicatePhotos,
        captureMode: slotMeta.captureMode,
        isPremium: frame.is_premium,
        isActive: frame.is_active,
        viewCount: frame.view_count,
        downloadCount: frame.download_count,
        createdBy: frame.created_by,
        createdAt: frame.created_at,
        updatedAt: frame.updated_at,
      },
    });
  } catch (error) {
    console.error("Get frame error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get frame",
    });
  }
});

/**
 * GET /api/frames/:id/config
 * Get frame config for EditPhoto page
 */
router.get("/:id/config", optionalAuth, async (req, res) => {
  try {
    const publicBaseUrl = resolvePublicBaseUrl(req);
    const result = await pool.query(`SELECT * FROM frames WHERE id = $1`, [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Frame not found",
      });
    }

    const frame = result.rows[0];

    // Block premium frame config for users without access.
    if (frame.is_premium) {
      const isAdmin = await isAdminForRequest(req);
      if (!isAdmin) {
        const userId = req.user?.uid || req.user?.userId || req.user?.id;
        const accessibleFrameIds = userId
          ? await paymentDB
              .getUserAccessibleFrames(String(userId))
              .catch(() => [])
          : [];
        const allowed = new Set(
          (accessibleFrameIds || []).map((id) => String(id))
        );
        if (!allowed.has(String(frame.id))) {
          return res.status(403).json({
            success: false,
            message: "Premium frame: akses diperlukan",
            redirect: "/pricing",
          });
        }
      }
    }

    const rawSlots =
      typeof frame.slots === "string"
        ? JSON.parse(frame.slots)
        : frame.slots || [];
    const layout =
      typeof frame.layout === "string"
        ? JSON.parse(frame.layout)
        : frame.layout || {};

    const slots = normalizeSlots(rawSlots, layout, frame.canvas_width, frame.canvas_height);
    const slotMeta = normalizeSlotsAndMode(slots);
    const normalizedSlots = slotMeta.slots;

    const withAbsoluteUploads = (value) => {
      if (typeof value !== "string" || value.length === 0) return value;
      if (value.startsWith("data:")) return value;
      // Strip internal localhost URLs (e.g. http://localhost:5050/uploads/...) → relative path
      const localhostMatch = value.match(/^https?:\/\/localhost:\d+(\/uploads\/.+)$/);
      if (localhostMatch) return `${publicBaseUrl}${localhostMatch[1]}`;
      if (value.startsWith("http://") || value.startsWith("https://")) {
        return value;
      }
      if (value.startsWith("/uploads/")) {
        return `${publicBaseUrl}${value}`;
      }
      return value;
    };

    // Canvas dimensions
    const W = frame.canvas_width || 1080;
    const H = frame.canvas_height || 1920;

    // Build image URL - use full URL
    const imageUrl = frame.image_path?.startsWith("http")
      ? frame.image_path
      : `${publicBaseUrl}${frame.image_path}`;

    // Build designer elements from slots (photo placeholders)
    const photoElements = normalizedSlots.map((s, i) => ({
      id: s.id || `photo_${i + 1}`,
      type: "photo",
      x: Math.round((s.left || 0) * W),
      y: Math.round((s.top || 0) * H),
      width: Math.round((s.width || 0.3) * W),
      height: Math.round((s.height || 0.2) * H),
      zIndex: s.zIndex || 1,
      data: {
        photoIndex: s.photoIndex !== undefined ? s.photoIndex : i,
        slotNumber: s.slotNumber !== undefined ? s.slotNumber : i + 1,
        image: null,
        borderRadius: s.borderRadius || 0,
      },
    }));

    // Build overlay elements from layout.elements (upload/overlay images)
    const overlayElements = (layout.elements || []).map((el) => {
      // Restore normalized positions to pixel values
      const restoredX =
        el.xNorm !== undefined ? Math.round(el.xNorm * W) : el.x || 0;
      const restoredY =
        el.yNorm !== undefined ? Math.round(el.yNorm * H) : el.y || 0;
      const restoredWidth =
        el.widthNorm !== undefined
          ? Math.round(el.widthNorm * W)
          : el.width || 100;
      const restoredHeight =
        el.heightNorm !== undefined
          ? Math.round(el.heightNorm * H)
          : el.height || 100;

      return {
        ...el,
        x: restoredX,
        y: restoredY,
        width: restoredWidth,
        height: restoredHeight,
        zIndex: el.zIndex || 10,
        // Mark as overlay so frontend knows not to treat it as a photo slot
        data: {
          ...el.data,
          __isOverlay: true,
          image: withAbsoluteUploads(el?.data?.image),
          originalImage: withAbsoluteUploads(el?.data?.originalImage),
        },
      };
    });

    // Combine all elements
    const allElements = [...photoElements, ...overlayElements];

    // Build config for EditPhoto
    const config = {
      id: frame.id,
      name: frame.name,
      description: frame.description,
      maxCaptures: frame.max_captures || normalizedSlots.length,
      duplicatePhotos: slotMeta.duplicatePhotos,
      captureMode: slotMeta.captureMode,
      imagePath: imageUrl,
      frameImage: imageUrl,
      thumbnailUrl: imageUrl,
      slots: normalizedSlots,
      canvasBackground:
        frame.canvas_background || layout.backgroundColor || "#ffffff",
      canvasWidth: W,
      canvasHeight: H,
      designer: {
        elements: allElements,
        background:
          frame.canvas_background || layout.backgroundColor || "#ffffff",
      },
      layout: {
        aspectRatio: layout.aspectRatio || "9:16",
        orientation: layout.orientation || "portrait",
        backgroundColor:
          frame.canvas_background || layout.backgroundColor || "#ffffff",
        elements: layout.elements || [],
      },
      category: frame.category,
      isCustom: true,
    };

    res.json(config);
  } catch (error) {
    console.error("Get frame config error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get frame config",
    });
  }
});

/**
 * POST /api/frames
 * Create new frame (Admin/Kreator only)
 * Supports both Firebase and PostgreSQL (VPS mode)
 */
router.post("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      id,
      name,
      description,
      category,
      categories,
      maxCaptures,
      max_captures,
      duplicatePhotos,
      slots,
      layout,
      tags,
      imagePath,
      image_path,
      thumbnailPath,
      thumbnail_path,
      isPremium,
      is_premium,
      is_hidden,
      canvasBackground,
      canvasWidth,
      canvasHeight,
      createdBy,
      source,
      is_template,
    } = req.body;

    // Validate name
    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Frame name is required",
      });
    }

    // Parse slots if string
    let parsedSlots = slots;
    if (typeof slots === "string") {
      try {
        parsedSlots = JSON.parse(slots);
      } catch (e) {
        parsedSlots = [];
      }
    }

    // Parse layout if string
    let parsedLayout = layout;
    if (typeof layout === "string") {
      try {
        parsedLayout = JSON.parse(layout);
      } catch (e) {
        parsedLayout = null;
      }
    }

    const frameId =
      id || `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const finalImagePath = imagePath || image_path || null;
    const finalThumbnailPath = thumbnailPath || thumbnail_path || finalImagePath;
    const finalMaxCaptures =
      maxCaptures || max_captures || parsedSlots?.length || 1;
    const finalCategory = category || (categories && categories[0]) || "custom";
    const finalIsHidden = Boolean(is_hidden);
    const normalizedSource = String(source || "fremio").trim().toLowerCase();
    const finalSource = normalizedSource === "designer"
      ? "designer"
      : normalizedSource === "studio_booth"
      ? "studio_booth"
      : "fremio";
    const finalIsTemplate = is_template !== undefined ? Boolean(is_template) : false;

    // IMPORTANT: Admin uploads are treated as premium by default unless explicitly set.
    const finalIsPremium =
      is_premium !== undefined
        ? Boolean(is_premium)
        : isPremium !== undefined
        ? Boolean(isPremium)
        : true;

    // DEBUG: Log layout data
    console.log("📦 [CREATE FRAME] Layout data received:");
    console.log("  - Raw layout type:", typeof layout);
    console.log(
      "  - Parsed layout:",
      JSON.stringify(parsedLayout, null, 2)?.substring(0, 500)
    );
    console.log(
      "  - Layout elements count:",
      parsedLayout?.elements?.length || 0
    );

    // Get user ID (UUID) for created_by - can be null if not found
    const createdByUserId = req.user?.userId || null;

    // Use PostgreSQL for VPS mode
    try {
      const result = await pool.query(
<<<<<<< HEAD
        `INSERT INTO frames (id, name, description, category, image_path, slots, max_captures, layout, canvas_background, canvas_width, canvas_height, created_by, is_active, is_hidden, is_premium, source, is_template)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, $13, $14, $15, $16)
=======
        `INSERT INTO frames (id, name, description, category, image_path, thumbnail_path, slots, max_captures, layout, canvas_background, canvas_width, canvas_height, created_by, is_active, is_hidden, is_premium, source, is_template)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, $15, $16, $17)
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             category = EXCLUDED.category,
             image_path = EXCLUDED.image_path,
             thumbnail_path = EXCLUDED.thumbnail_path,
             slots = EXCLUDED.slots,
             max_captures = EXCLUDED.max_captures,
             layout = EXCLUDED.layout,
             canvas_background = EXCLUDED.canvas_background,
             canvas_width = EXCLUDED.canvas_width,
             canvas_height = EXCLUDED.canvas_height,
             is_hidden = EXCLUDED.is_hidden,
             is_premium = EXCLUDED.is_premium,
             source = EXCLUDED.source,
             is_template = EXCLUDED.is_template,
             updated_at = NOW()
           RETURNING *`,
        [
          frameId,
          name.trim(),
          description || "",
          finalCategory,
          finalImagePath,
          finalThumbnailPath,
          JSON.stringify(parsedSlots || []),
          finalMaxCaptures,
          JSON.stringify(parsedLayout || {}),
          canvasBackground || "#ffffff",
          canvasWidth || 1080,
          canvasHeight || 1920,
          createdByUserId,
          finalIsHidden,
          finalIsPremium,
          finalSource,
          finalIsTemplate,
        ]
      );

      const frame = result.rows[0];

      console.log(`✅ Frame created: ${frame.name} (${frame.id})`);

      res.status(201).json({
        success: true,
        message: "Frame berhasil dibuat",
        frame: {
          id: frame.id,
          name: frame.name,
          description: frame.description,
          category: frame.category,
          imagePath: frame.image_path,
          thumbnailPath: frame.thumbnail_path,
          slots: frame.slots,
          maxCaptures: frame.max_captures,
          is_hidden: frame.is_hidden,
          isPremium: frame.is_premium,
          source: frame.source || "fremio",
          is_template: frame.is_template || false,
        },
      });
    } catch (dbError) {
      console.error("PostgreSQL error:", dbError);

      // Fallback to Firebase if PostgreSQL fails
      try {
        const db = getFirestore();
        if (db) {
          const frameData = {
            name: name.trim(),
            description: description || "",
            category: finalCategory,
            imagePath: finalImagePath,
            thumbnailPath: finalThumbnailPath,
            is_hidden: finalIsHidden,
            isPremium: finalIsPremium,
            is_premium: finalIsPremium,
            slots: parsedSlots || [],
            maxCaptures: finalMaxCaptures,
            layout: parsedLayout,
            status: "approved",
            createdBy: req.user?.email || createdBy || "admin",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await db.collection("custom_frames").doc(frameId).set(frameData);

          res.status(201).json({
            success: true,
            message: "Frame berhasil dibuat (Firebase)",
            frame: { id: frameId, ...frameData },
          });
        } else {
          throw new Error("No database available");
        }
      } catch (fbError) {
        console.error("Firebase fallback error:", fbError);
        res.status(500).json({
          success: false,
          message: "Failed to create frame",
        });
      }
    }
  } catch (error) {
    console.error("Create frame error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create frame",
    });
  }
});

/**
 * PUT /api/frames/:id
 * Update frame (Admin or frame owner) - PostgreSQL
 */
router.put("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    // Check if frame exists
    const checkResult = await pool.query(`SELECT * FROM frames WHERE id = $1`, [
      req.params.id,
    ]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Frame not found",
      });
    }

    const {
      name,
      description,
      category,
      maxCaptures,
      max_captures,
      slots,
      layout,
      canvasBackground,
      canvasWidth,
      canvasHeight,
      imagePath,
      image_path,
      thumbnailPath,
      thumbnail_path,
      is_active,
      is_premium,
      is_hidden,
      displayOrder,
      display_order,
      flowType,
      flow_type,
      source,
      is_template,
    } = req.body;

    const normalizeFlowType = (value) => {
      if (value == null) return null;
      const normalized = String(value).trim().toLowerCase();
      if (normalized === "fixed") return "fixed";
      if (normalized === "personalized" || normalized === "personalised") {
        return "personalized";
      }
      return null;
    };

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (category) {
      updates.push(`category = $${paramIndex++}`);
      values.push(category);
    }
    if (maxCaptures || max_captures) {
      updates.push(`max_captures = $${paramIndex++}`);
      values.push(parseInt(maxCaptures || max_captures));
    }
    if (slots !== undefined) {
      updates.push(`slots = $${paramIndex++}`);
      values.push(typeof slots === "string" ? slots : JSON.stringify(slots));
    }
    if (layout !== undefined) {
      updates.push(`layout = $${paramIndex++}`);
      values.push(typeof layout === "string" ? layout : JSON.stringify(layout));
    }
    if (canvasBackground) {
      updates.push(`canvas_background = $${paramIndex++}`);
      values.push(canvasBackground);
    }
    if (canvasWidth) {
      updates.push(`canvas_width = $${paramIndex++}`);
      values.push(canvasWidth);
    }
    if (canvasHeight) {
      updates.push(`canvas_height = $${paramIndex++}`);
      values.push(canvasHeight);
    }
    if (imagePath || image_path) {
      updates.push(`image_path = $${paramIndex++}`);
      values.push(imagePath || image_path);
    }
    if (thumbnailPath !== undefined || thumbnail_path !== undefined) {
      updates.push(`thumbnail_path = $${paramIndex++}`);
      values.push(thumbnailPath ?? thumbnail_path ?? null);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    if (is_premium !== undefined) {
      updates.push(`is_premium = $${paramIndex++}`);
      values.push(is_premium);
    }
    if (is_hidden !== undefined) {
      updates.push(`is_hidden = $${paramIndex++}`);
      values.push(is_hidden);
    }
    if (displayOrder !== undefined || display_order !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      values.push(parseInt(displayOrder ?? display_order));
    }

    const nextFlowType = normalizeFlowType(flowType ?? flow_type);
    if (flowType !== undefined || flow_type !== undefined) {
      if (!nextFlowType) {
        return res.status(400).json({
          success: false,
          message: "Invalid flow_type. Use 'fixed' or 'personalized'.",
        });
      }
      updates.push(`flow_type = $${paramIndex++}`);
      values.push(nextFlowType);
    }

    if (source !== undefined) {
      const normalizedSource = String(source).trim().toLowerCase();
      const safeSource = normalizedSource === 'designer'
        ? 'designer'
        : normalizedSource === 'studio_booth'
        ? 'studio_booth'
        : 'fremio';
      updates.push(`source = $${paramIndex++}`);
      values.push(safeSource);
    }

    if (is_template !== undefined) {
      updates.push(`is_template = $${paramIndex++}`);
      values.push(!!is_template);
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const query = `UPDATE frames SET ${updates.join(
      ", "
    )} WHERE id = $${paramIndex} RETURNING *`;
    await pool.query(query, values);

    res.json({
      success: true,
      message: "Frame updated successfully",
    });
  } catch (error) {
    console.error("Update frame error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update frame",
    });
  }
});

/**
 * DELETE /api/frames/:id
 * Delete frame (Admin only) - PostgreSQL
 */
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    // Check if frame exists and get image path
    const checkResult = await pool.query(`SELECT * FROM frames WHERE id = $1`, [
      req.params.id,
    ]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Frame not found",
      });
    }

    const frame = checkResult.rows[0];

    // Delete frame image from storage if exists
    if (frame.image_path) {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const imagePath = path.join(process.cwd(), "public", frame.image_path);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (fsError) {
        console.error("Error deleting frame image:", fsError);
      }
    }

    // Delete frame from database
    await pool.query(`DELETE FROM frames WHERE id = $1`, [req.params.id]);

    console.log(`✅ Frame deleted: ${frame.name} (${frame.id})`);

    res.json({
      success: true,
      message: "Frame deleted successfully",
    });
  } catch (error) {
    console.error("Delete frame error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete frame",
    });
  }
});

/**
 * POST /api/frames/:id/like
 * Like/unlike frame
 */
router.post("/:id/like", verifyToken, async (req, res) => {
  try {
    const db = getFirestore();
    const frameDoc = await db
      .collection("custom_frames")
      .doc(req.params.id)
      .get();

    if (!frameDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Frame not found",
      });
    }

    const frameData = frameDoc.data();

    // Toggle like
    await db
      .collection("custom_frames")
      .doc(req.params.id)
      .update({
        likes: (frameData.likes || 0) + 1,
      });

    // Track analytics
    await db.collection("analytics_events").add({
      userId: req.user.uid,
      eventType: "frame_like",
      frameId: req.params.id,
      frameName: frameData.name,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: "Frame liked",
      likes: (frameData.likes || 0) + 1,
    });
  } catch (error) {
    console.error("Like frame error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to like frame",
    });
  }
});

export default router;
