import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync, createReadStream } from "fs";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Static files base directory
const STATIC_DIR = process.env.STATIC_DIR || path.join(process.cwd(), "public");
const FRAMES_DIR = path.join(STATIC_DIR, "frames");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Ensure directories exist
if (!existsSync(STATIC_DIR)) {
  mkdirSync(STATIC_DIR, { recursive: true });
}
if (!existsSync(FRAMES_DIR)) {
  mkdirSync(FRAMES_DIR, { recursive: true });
}

// Multer configuration for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed."));
    }
  },
});

/**
 * GET /api/static/frames
 * List all frame images
 */
router.get("/frames", async (req, res) => {
  try {
    const files = await fs.readdir(FRAMES_DIR);
    const imageFiles = files.filter((f) =>
      /\.(jpg|jpeg|png|webp|gif)$/i.test(f)
    );

    const baseUrl = process.env.VPS_BASE_URL || `http://${req.headers.host}`;
    const images = imageFiles.map((filename) => ({
      filename,
      url: `${baseUrl}/static/frames/${filename}`,
    }));

    res.json({
      success: true,
      count: images.length,
      images,
    });
  } catch (error) {
    console.error("List frames error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to list frames",
    });
  }
});

/**
 * POST /api/static/frames
 * Upload frame image to VPS disk
 */
router.post("/frames", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    const { name, optimize = "true" } = req.body;

    // Generate unique filename
    const ext = req.file.mimetype === "image/png" ? "png" : "jpg";
    const timestamp = Date.now();
    const sanitizedName = name
      ? name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50)
      : uuidv4().substring(0, 8);
    const filename = `${timestamp}_${sanitizedName}.${ext}`;
    const filePath = path.join(FRAMES_DIR, filename);

    let buffer = req.file.buffer;

    // Optimize image if requested (but preserve PNG for transparency)
    if (optimize === "true" && req.file.mimetype !== "image/png") {
      buffer = await sharp(buffer)
        .resize(1920, 1920, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } else if (optimize === "true" && req.file.mimetype === "image/png") {
      // Optimize PNG but preserve transparency
      buffer = await sharp(buffer)
        .resize(1920, 1920, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .png({ quality: 85 })
        .toBuffer();
    }

    // Save to disk
    await fs.writeFile(filePath, buffer);

    const baseUrl = process.env.VPS_BASE_URL || `http://${req.headers.host}`;
    const imageUrl = `${baseUrl}/static/frames/${filename}`;

    console.log(`✅ Frame image saved: ${filename}`);

    res.json({
      success: true,
      message: "Frame uploaded successfully",
      filename,
      url: imageUrl,
      size: buffer.length,
    });
  } catch (error) {
    console.error("Upload frame error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload frame",
    });
  }
});

/**
 * POST /api/static/frames/upload-base64
 * Upload frame image from base64 data
 */
router.post("/frames/upload-base64", async (req, res) => {
  try {
    const { imageData, name } = req.body;

    if (!imageData) {
      return res.status(400).json({
        success: false,
        message: "No image data provided",
      });
    }

    // Extract base64 data
    let base64Data = imageData;
    let mimeType = "image/png";

    if (imageData.includes(",")) {
      const parts = imageData.split(",");
      base64Data = parts[1];
      const mimeMatch = parts[0].match(/data:([^;]+);/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
    }

    const buffer = Buffer.from(base64Data, "base64");

    // Check file size
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        message: "Image too large. Maximum size is 10MB.",
      });
    }

    // Generate filename
    const ext = mimeType === "image/png" ? "png" : "jpg";
    const timestamp = Date.now();
    const sanitizedName = name
      ? name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50)
      : uuidv4().substring(0, 8);
    const filename = `${timestamp}_${sanitizedName}.${ext}`;
    const filePath = path.join(FRAMES_DIR, filename);

    // Optimize but preserve transparency for PNG
    let optimizedBuffer;
    if (mimeType === "image/png") {
      optimizedBuffer = await sharp(buffer)
        .resize(1920, 1920, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .png({ quality: 85 })
        .toBuffer();
    } else {
      optimizedBuffer = await sharp(buffer)
        .resize(1920, 1920, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    // Save to disk
    await fs.writeFile(filePath, optimizedBuffer);

    const baseUrl = process.env.VPS_BASE_URL || `http://${req.headers.host}`;
    const imageUrl = `${baseUrl}/static/frames/${filename}`;

    console.log(`✅ Frame image saved (base64): ${filename}`);

    res.json({
      success: true,
      message: "Frame uploaded successfully",
      filename,
      url: imageUrl,
      size: optimizedBuffer.length,
    });
  } catch (error) {
    console.error("Upload frame (base64) error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload frame",
    });
  }
});

/**
 * DELETE /api/static/frames/:filename
 * Delete frame image
 */
router.delete("/frames/:filename", async (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename to prevent path traversal
    if (filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({
        success: false,
        message: "Invalid filename",
      });
    }

    const filePath = path.join(FRAMES_DIR, filename);

    if (!existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    await fs.unlink(filePath);

    console.log(`✅ Frame image deleted: ${filename}`);

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
 * GET /static/frames/:filename
 * Serve frame image (for direct access without /api prefix)
 */
router.get("/serve/:folder/:filename", async (req, res) => {
  try {
    const { folder, filename } = req.params;

    // Only allow frames folder for now
    if (folder !== "frames") {
      return res.status(404).send("Not found");
    }

    // Validate filename to prevent path traversal
    if (filename.includes("..") || filename.includes("/")) {
      return res.status(400).send("Invalid filename");
    }

    const filePath = path.join(FRAMES_DIR, filename);

    if (!existsSync(filePath)) {
      return res.status(404).send("File not found");
    }

    // Set content type based on extension
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };

    res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000"); // 1 year cache

    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("Serve frame error:", error);
    res.status(500).send("Error serving file");
  }
});

export default router;
