/**
 * Users Routes - Simple endpoint for fetching all users
 */
import express from "express";
import pg from "pg";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres123",
});

const router = express.Router();

// GET all users (admin only)
router.get("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, display_name, role, is_active, created_at FROM users ORDER BY created_at DESC",
    );

    res.json({
      success: true,
      users: result.rows.map((u) => ({
        ...u,
        status: u.is_active ? "active" : "inactive",
      })),
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
});

// GET user registration stats (admin only)
router.get("/stats", verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') AS new_users_7d,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days') AS new_users_30d,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '90 days') AS new_users_90d,
        (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE) AS new_users_today,
        (SELECT COUNT(*) FROM users WHERE is_active = true) AS active_users
    `);
    const row = result.rows[0];
    res.json({
      success: true,
      total_users: parseInt(row.total_users) || 0,
      new_users_7d: parseInt(row.new_users_7d) || 0,
      new_users_30d: parseInt(row.new_users_30d) || 0,
      new_users_90d: parseInt(row.new_users_90d) || 0,
      new_users_today: parseInt(row.new_users_today) || 0,
      active_users: parseInt(row.active_users) || 0,
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res.status(500).json({ success: false, message: "Failed to fetch user stats" });
  }
});

export default router;
