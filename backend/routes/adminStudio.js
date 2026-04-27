import express from "express";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

const STUDIO_BASE_URL = process.env.STUDIO_BASE_URL || "https://studio.fremio.id";
const STUDIO_ADMIN_SECRET = process.env.STUDIO_ADMIN_SECRET || "";

const getStudioHeaders = () => ({
  Authorization: `Bearer ${STUDIO_ADMIN_SECRET}`,
  "Content-Type": "application/json",
});

const ensureStudioSecret = (res) => {
  if (!STUDIO_ADMIN_SECRET) {
    res.status(500).json({
      success: false,
      message: "STUDIO_ADMIN_SECRET belum dikonfigurasi di backend",
    });
    return false;
  }
  return true;
};

router.get("/operators", verifyToken, requireAdmin, async (req, res) => {
  if (!ensureStudioSecret(res)) return;

  try {
    const response = await fetch(`${STUDIO_BASE_URL}/api/admin/studio-operators`, {
      method: "GET",
      headers: getStudioHeaders(),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      return res.status(response.status || 502).json({
        success: false,
        message: payload?.error || payload?.message || "Gagal mengambil data owner studio",
      });
    }

    return res.json({
      success: true,
      data: payload.data || [],
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: `Gagal menghubungi Studio API: ${error.message}`,
    });
  }
});

router.get("/managed-frames", verifyToken, requireAdmin, async (req, res) => {
  if (!ensureStudioSecret(res)) return;

  try {
    const response = await fetch(`${STUDIO_BASE_URL}/api/admin/studio-managed-frames`, {
      method: "GET",
      headers: getStudioHeaders(),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      return res.status(response.status || 502).json({
        success: false,
        message: payload?.error || payload?.message || "Gagal mengambil pengaturan frame studio",
      });
    }

    return res.json({
      success: true,
      data: payload.data || { enforceWhitelist: false, allowedFrameIds: [] },
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: `Gagal menghubungi Studio API: ${error.message}`,
    });
  }
});

router.put("/managed-frames", verifyToken, requireAdmin, async (req, res) => {
  if (!ensureStudioSecret(res)) return;

  try {
    const response = await fetch(`${STUDIO_BASE_URL}/api/admin/studio-managed-frames`, {
      method: "PUT",
      headers: getStudioHeaders(),
      body: JSON.stringify({
        enforceWhitelist: !!req.body?.enforceWhitelist,
        allowedFrameIds: Array.isArray(req.body?.allowedFrameIds)
          ? req.body.allowedFrameIds.map((v) => String(v))
          : [],
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      return res.status(response.status || 502).json({
        success: false,
        message: payload?.error || payload?.message || "Gagal menyimpan pengaturan frame studio",
      });
    }

    return res.json({
      success: true,
      data: payload.data,
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: `Gagal menghubungi Studio API: ${error.message}`,
    });
  }
});

export default router;
