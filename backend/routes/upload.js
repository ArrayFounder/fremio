import express from "express";
import { verifyToken, requireAdmin } from "../middleware/auth.js";
import {
  uploadImage,
  uploadVideo,
  uploadImages,
  handleUploadError,
} from "../middleware/upload.js";
import storageService from "../services/storageService.js";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Ensure directory exists (sync) for upload paths.
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * POST /api/upload/frame
 * Upload frame image (admin only)
 * Converts to WebP for optimization
 */
router.post(
  "/frame",
  verifyToken,
  requireAdmin,
  uploadImage,
  handleUploadError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Tidak ada file yang diupload" });
      }

      const filename = `${uuidv4()}.webp`;
      const uploadDir = path.join(__dirname, "../uploads/frames");
      const filepath = path.join(uploadDir, filename);

      // Ensure directory exists
      ensureDir(uploadDir);

      // Process and optimize image with Sharp
      await sharp(req.file.buffer)
        .webp({ quality: 85 })
        .resize(1080, 1920, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .toFile(filepath);

      const imageUrl = `/uploads/frames/${filename}`;

      console.log(`📸 Frame image uploaded: ${filename}`);

      res.json({
        success: true,
        message: "Gambar berhasil diupload",
        imagePath: imageUrl,
        filename,
      });
    } catch (error) {
      console.error("Upload frame error:", error);
      res.status(500).json({ error: "Gagal upload gambar" });
    }
  }
);

/**
 * POST /api/upload/overlay
 * Upload overlay element image (admin and designer)
 * Preserves transparency (PNG/WebP). Stores on VPS disk and returns /uploads/overlays/*
 */
const requireAdminOrDesigner = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Authentication required" });
  const role = req.user.role;
  if (role === "admin" || role === "designer" || role === "kreator") return next();
  return res.status(403).json({ success: false, message: "Access denied" });
};

router.post(
  "/overlay",
  verifyToken,
  requireAdminOrDesigner,
  uploadImage,
  handleUploadError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Tidak ada file yang diupload" });
      }

      const mime = String(req.file.mimetype || "").toLowerCase();
      const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";

      const filename = `${uuidv4()}.${ext}`;
      const uploadDir = path.join(__dirname, "../uploads/overlays");
      const filepath = path.join(uploadDir, filename);
      ensureDir(uploadDir);

      // Keep alpha and avoid aggressive resizing. Cap the largest side for safety.
      const maxSide = 3000;
      let pipeline = sharp(req.file.buffer).rotate();
      try {
        pipeline = pipeline.resize({
          width: maxSide,
          height: maxSide,
          fit: "inside",
          withoutEnlargement: true,
        });
      } catch (e) {
        // ignore resize errors
      }

      if (ext === "webp") {
        await pipeline.webp({ quality: 90 }).toFile(filepath);
      } else if (ext === "jpg") {
        await pipeline.jpeg({ quality: 90 }).toFile(filepath);
      } else {
        // png
        await pipeline.png({ compressionLevel: 9 }).toFile(filepath);
      }

      const imageUrl = `/uploads/overlays/${filename}`;

      res.json({
        success: true,
        message: "Overlay berhasil diupload",
        imagePath: imageUrl,
        filename,
      });
    } catch (error) {
      console.error("Upload overlay error:", error);
      res.status(500).json({ error: "Gagal upload overlay" });
    }
  }
);

/**
 * POST /api/upload/image
 * Upload single image
 */
router.post(
  "/image",
  verifyToken,
  uploadImage,
  handleUploadError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No image file provided",
        });
      }

      const { folder = "temp", generateThumbnail = false } = req.body;
      const userId = req.user.uid;
      const timestamp = Date.now();
      const basePath = `users/${userId}/${folder}/${timestamp}`;

      let imageUrl, thumbnailUrl;

      if (generateThumbnail === "true") {
        const result = await storageService.uploadImageWithThumbnail(
          req.file.buffer,
          basePath
        );
        imageUrl = result.imageUrl;
        thumbnailUrl = result.thumbnailUrl;
      } else {
        imageUrl = await storageService.uploadImage(
          req.file.buffer,
          `${basePath}.jpg`,
          {
            maxWidth: 1920,
            quality: 85,
          }
        );
      }

      res.json({
        success: true,
        message: "Image uploaded successfully",
        imageUrl,
        thumbnailUrl: thumbnailUrl || null,
      });
    } catch (error) {
      console.error("Upload image error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to upload image",
      });
    }
  }
);

/**
 * POST /api/upload/images
 * Upload multiple images
 */
router.post(
  "/images",
  verifyToken,
  uploadImages,
  handleUploadError,
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No image files provided",
        });
      }

      const { folder = "temp" } = req.body;
      const userId = req.user.uid;
      const uploadedImages = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const timestamp = Date.now();
        const path = `users/${userId}/${folder}/${timestamp}-${i}.jpg`;

        const imageUrl = await storageService.uploadImage(file.buffer, path, {
          maxWidth: 1920,
          quality: 85,
        });

        uploadedImages.push({
          url: imageUrl,
          originalName: file.originalname,
          size: file.size,
        });
      }

      res.json({
        success: true,
        message: `${uploadedImages.length} images uploaded successfully`,
        images: uploadedImages,
      });
    } catch (error) {
      console.error("Upload images error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to upload images",
      });
    }
  }
);

/**
 * POST /api/upload/video
 * Upload video
 */
router.post(
  "/video",
  verifyToken,
  uploadVideo,
  handleUploadError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No video file provided",
        });
      }

      const { folder = "temp" } = req.body;
      const userId = req.user.uid;
      const timestamp = Date.now();
      const ext = req.file.mimetype.split("/")[1];
      const path = `users/${userId}/${folder}/${timestamp}.${ext}`;

      const videoUrl = await storageService.uploadFile(req.file.buffer, path, {
        contentType: req.file.mimetype,
        public: true,
      });

      res.json({
        success: true,
        message: "Video uploaded successfully",
        videoUrl,
        size: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (error) {
      console.error("Upload video error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to upload video",
      });
    }
  }
);

export default router;
