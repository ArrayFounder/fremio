import express from "express";
import { body, query } from "express-validator";
import { randomUUID } from "crypto";
import { getFirestore } from "../config/firebase.js";
import { verifyToken } from "../middleware/auth.js";
import validate from "../middleware/validator.js";
import storageService from "../services/storageService.js";

const router = express.Router();

/**
 * GET /api/drafts
 * Get all drafts for current user
 */
router.get(
  "/",
  verifyToken,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 50 }),
  ],
  validate,
  async (req, res) => {
    try {
      const db = getFirestore();
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      let query = db
        .collection("drafts")
        .where("userId", "==", req.user.uid)
        .orderBy("updatedAt", "desc");

      // Pagination
      const offset = (page - 1) * limit;
      if (offset > 0) {
        const snapshot = await query.limit(offset).get();
        if (!snapshot.empty) {
          const lastDoc = snapshot.docs[snapshot.docs.length - 1];
          query = query.startAfter(lastDoc);
        }
      }

      const snapshot = await query.limit(limit).get();

      const drafts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Get total count
      const countSnapshot = await db
        .collection("drafts")
        .where("userId", "==", req.user.uid)
        .count()
        .get();

      res.json({
        success: true,
        drafts,
        pagination: {
          page,
          limit,
          total: countSnapshot.data().count,
          totalPages: Math.ceil(countSnapshot.data().count / limit),
        },
      });
    } catch (error) {
      console.error("Get drafts error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get drafts",
      });
    }
  }
);

/**
 * GET /api/drafts/share/:shareId
 * Get shared draft by share_id (PUBLIC - no auth required)
 */
router.get("/share/:shareId", async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection("drafts")
      .where("share_id", "==", req.params.shareId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Draft not found",
      });
    }

    const draftDoc = snapshot.docs[0];
    const draftData = draftDoc.data();

    if (!draftData.is_public) {
      return res.status(404).json({
        success: false,
        message: "Draft not found or not public",
      });
    }

    res.json({
      success: true,
      draft: {
        id: draftDoc.id,
        ...draftData,
      },
    });
  } catch (error) {
    console.error("Get shared draft error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get shared draft",
    });
  }
});

/**
 * GET /api/drafts/:id
 * Get single draft
 */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const db = getFirestore();
    const draftDoc = await db.collection("drafts").doc(req.params.id).get();

    if (!draftDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Draft not found",
      });
    }

    const draftData = draftDoc.data();

    // Check ownership
    if (draftData.userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      draft: {
        id: draftDoc.id,
        ...draftData,
      },
    });
  } catch (error) {
    console.error("Get draft error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get draft",
    });
  }
});

/**
 * POST /api/drafts/public-share
 * Create a publicly shareable frame (no auth required)
 */
router.post("/public-share", async (req, res) => {
  try {
    const db = getFirestore();
    const { title, frameData, previewUrl } = req.body;

    if (!title || !frameData) {
      return res.status(400).json({
        success: false,
        message: "title and frameData are required",
      });
    }

    let elements = [];
    try {
      const parsed = JSON.parse(frameData);
      elements = parsed.elements || [];
    } catch (e) { /* ignore */ }

    const shareId = randomUUID().replace(/-/g, "").substring(0, 16);
    const draftData = {
      userId: null,
      title: title || "Shared Frame",
      frame_data: frameData,
      preview_url: previewUrl || null,
      share_id: shareId,
      is_public: true,
      elements,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const draftRef = await db.collection("drafts").add(draftData);

    res.status(201).json({
      success: true,
      draft: {
        id: draftRef.id,
        share_id: shareId,
        ...draftData,
      },
    });
  } catch (error) {
    console.error("Public share error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create public share",
    });
  }
});

/**
 * POST /api/drafts
 * Create new draft
 */
router.post(
  "/",
  verifyToken,
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("canvasBackground").optional().isString(),
    body("elements").optional().isArray().withMessage("Elements must be an array"),
    body("frameData").optional().isString(),
  ],
  validate,
  async (req, res) => {
    try {
      const db = getFirestore();
      const {
        title,
        canvasBackground,
        canvasWidth,
        canvasHeight,
        elements,
        exportConfig,
        frameData,
        previewUrl,
      } = req.body;

      // Support both elements-array format AND frameData JSON string format
      let finalElements = elements || [];
      let finalBackground = canvasBackground || "#ffffff";
      let finalWidth = canvasWidth || 1080;
      let finalHeight = canvasHeight || 1920;

      if (frameData) {
        try {
          const parsed = JSON.parse(frameData);
          if (Array.isArray(parsed.elements)) finalElements = parsed.elements;
          if (parsed.canvasBackground) finalBackground = parsed.canvasBackground;
          if (parsed.canvasWidth) finalWidth = parsed.canvasWidth;
          if (parsed.canvasHeight) finalHeight = parsed.canvasHeight;
        } catch (e) { /* ignore parse errors */ }
      }

      const shareId = randomUUID().replace(/-/g, "").substring(0, 16);
      const draftData = {
        userId: req.user.uid,
        title,
        canvasBackground: finalBackground,
        canvasWidth: finalWidth,
        canvasHeight: finalHeight,
        elements: finalElements,
        frame_data: frameData || null,
        preview_url: previewUrl || null,
        share_id: shareId,
        is_public: false,
        capturedPhotos: [],
        capturedVideos: [],
        exportConfig: exportConfig || {
          format: "png",
          quality: 0.9,
          includeWatermark: false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const draftRef = await db.collection("drafts").add(draftData);

      res.status(201).json({
        success: true,
        message: "Draft created successfully",
        draftId: draftRef.id,
        draft: {
          id: draftRef.id,
          share_id: shareId,
          ...draftData,
        },
      });
    } catch (error) {
      console.error("Create draft error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create draft",
      });
    }
  }
);

/**
 * PATCH /api/drafts/:id/visibility
 * Update draft visibility (public/private)
 */
router.patch("/:id/visibility", verifyToken, async (req, res) => {
  try {
    const db = getFirestore();
    const draftDoc = await db.collection("drafts").doc(req.params.id).get();

    if (!draftDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Draft not found",
      });
    }

    const draftData = draftDoc.data();
    if (draftData.userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { isPublic } = req.body;
    await db.collection("drafts").doc(req.params.id).update({
      is_public: !!isPublic,
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Draft is now ${isPublic ? "public" : "private"}`,
      draft: { id: req.params.id, is_public: !!isPublic },
    });
  } catch (error) {
    console.error("Update visibility error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update visibility",
    });
  }
});

/**
 * PUT /api/drafts/:id
 * Update draft
 */
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const db = getFirestore();
    const draftDoc = await db.collection("drafts").doc(req.params.id).get();

    if (!draftDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Draft not found",
      });
    }

    const draftData = draftDoc.data();

    // Check ownership
    if (draftData.userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const updates = {
      updatedAt: new Date().toISOString(),
    };

    const {
      title,
      canvasBackground,
      elements,
      capturedPhotos,
      capturedVideos,
      exportConfig,
    } = req.body;

    if (title) updates.title = title;
    if (canvasBackground) updates.canvasBackground = canvasBackground;
    if (elements) updates.elements = elements;
    if (capturedPhotos) updates.capturedPhotos = capturedPhotos;
    if (capturedVideos) updates.capturedVideos = capturedVideos;
    if (exportConfig) updates.exportConfig = exportConfig;
    if (capturedPhotos || capturedVideos) {
      updates.lastCapturedAt = new Date().toISOString();
    }

    await db.collection("drafts").doc(req.params.id).update(updates);

    res.json({
      success: true,
      message: "Draft updated successfully",
    });
  } catch (error) {
    console.error("Update draft error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update draft",
    });
  }
});

/**
 * DELETE /api/drafts/:id
 * Delete draft
 */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const db = getFirestore();
    const draftDoc = await db.collection("drafts").doc(req.params.id).get();

    if (!draftDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Draft not found",
      });
    }

    const draftData = draftDoc.data();

    // Check ownership
    if (draftData.userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Delete associated files from storage
    if (draftData.capturedPhotos && draftData.capturedPhotos.length > 0) {
      for (const photoUrl of draftData.capturedPhotos) {
        await storageService.deleteFileByUrl(photoUrl);
      }
    }

    if (draftData.capturedVideos && draftData.capturedVideos.length > 0) {
      for (const video of draftData.capturedVideos) {
        if (video.videoUrl)
          await storageService.deleteFileByUrl(video.videoUrl);
        if (video.thumbnailUrl)
          await storageService.deleteFileByUrl(video.thumbnailUrl);
      }
    }

    // Delete draft document
    await db.collection("drafts").doc(req.params.id).delete();

    res.json({
      success: true,
      message: "Draft deleted successfully",
    });
  } catch (error) {
    console.error("Delete draft error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete draft",
    });
  }
});

export default router;
