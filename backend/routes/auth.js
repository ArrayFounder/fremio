import express from "express";
import { body } from "express-validator";
import { getFirestore, getAuth } from "../config/firebase.js";
import { verifyToken } from "../middleware/auth.js";
import validate from "../middleware/validator.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pg from "pg";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "fremio_dev_secret_key";

// In-memory storage for temporary users (when database is unavailable)
// WARNING: This is NOT production-ready! Users will be lost on server restart.
const tempUsers = new Map();

// Database pool for JWT auth
const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres123",
});

/**
 * POST /api/auth/login
 * Login with email/password (JWT)
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password diperlukan",
      });
    }

    let user = null;

    // Try PostgreSQL first
    try {
      const result = await pool.query(
        "SELECT * FROM users WHERE email = $1 AND is_active = true",
        [email.toLowerCase()]
      );

      if (result.rows.length > 0) {
        user = result.rows[0];
      }
    } catch (dbError) {
      console.log("⚠️  Database connection failed, trying fallback methods");

      // Check in-memory temporary users first
      if (tempUsers.has(email.toLowerCase())) {
        user = tempUsers.get(email.toLowerCase());
        console.log("✅ Found user in temporary storage");
      }
      // Fallback to hardcoded admin if no temp user found
      else if (email.toLowerCase() === "admin@fremio.com") {
        // Hardcoded admin: email=admin@fremio.com, password=admin123
        // Hash generated fresh: bcrypt.hash('admin123', 12)
        user = {
          id: "00000000-0000-0000-0000-000000000001",
          email: "admin@fremio.com",
          password_hash:
            "$2a$12$bttg9h8Hm.w2pwHVwaSTvONrRsC2kZlszZeJck1InWT2PlN3P88Am",
          display_name: "Fremio Admin",
          role: "admin",
        };
        console.log("✅ Using fallback admin user");
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    // Check if user has dummy password (from CSV import)
    const DUMMY_PASSWORD_HASH = "$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.M5nwZvvGNHhHxm";
    const hasDummyPassword = user.password_hash === DUMMY_PASSWORD_HASH;

    if (hasDummyPassword) {
      // Generate temporary token for password setup
      const tempToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          temp: true
        },
        JWT_SECRET,
        { expiresIn: "15m" } // Short expiry for security
      );

      console.log(`🔑 User needs to set password: ${user.email}`);

      return res.status(202).json({
        success: true,
        requirePasswordSetup: true,
        message: "Silakan buat password baru",
        email: user.email,
        tempToken
      });
    }

    // Check password for non-dummy users
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Update last login (ignore if column doesn't exist)
    try {
      await pool.query("UPDATE users SET updated_at = NOW() WHERE id = $1", [
        user.id,
      ]);
    } catch (e) {
      // Ignore error if column doesn't exist
    }

    console.log(`✅ User logged in: ${user.email} (${user.role})`);

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
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login gagal. Coba lagi.",
    });
  }
});

/**
 * POST /api/auth/set-first-password
 * Set password for first time (for CSV imported users)
 */
router.post("/set-first-password", verifyToken, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password diperlukan"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 6 karakter"
      });
    }

    // Verify this is a temp token
    if (!req.user.temp) {
      return res.status(403).json({
        success: false,
        message: "Token tidak valid untuk operasi ini"
      });
    }

    // Verify email matches token
    if (req.user.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: "Email tidak sesuai"
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(password, 12);

    // Update user password
    const result = await pool.query(
      `UPDATE users 
       SET password_hash = $1, updated_at = NOW() 
       WHERE email = $2 AND is_active = true
       RETURNING id, email, display_name, role`,
      [newPasswordHash, email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan"
      });
    }

    const user = result.rows[0];

    console.log(`✅ Password set for user: ${user.email}`);

    res.json({
      success: true,
      message: "Password berhasil diatur"
    });

  } catch (error) {
    console.error("Set password error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengatur password"
    });
  }
});

/**
 * POST /api/auth/register-jwt
 * Register with email/password (JWT)
 */
router.post("/register-jwt", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password diperlukan",
      });
    }

    // Check if user exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, email, display_name, role`,
      [email.toLowerCase(), passwordHash, displayName || email.split("@")[0]]
    );

    const user = result.rows[0];

    // Generate token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`✅ New user registered: ${user.email}`);

    res.status(201).json({
      success: true,
      message: "Registrasi berhasil",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      message: "Registrasi gagal. Coba lagi.",
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get("/me", verifyToken, (req, res) => {
  const userId = req.user?.userId || req.user?.uid || req.user?.id;
  res.json({
    success: true,
    user: {
      uid: userId,
      id: userId,
      email: req.user.email,
      name: "Admin",
      displayName: "Admin",
      role: req.user.role || "user",
    },
  });
});

/**
 * POST /api/auth/register
 * Register new user - supports both JWT (PostgreSQL) and Firebase modes
 * JWT mode: requires email, password, displayName (optional firstName, lastName)
 * Firebase mode: requires uid, email, name
 */
router.post("/register", async (req, res) => {
  try {
    const {
      uid,
      email,
      password,
      name,
      displayName,
      firstName,
      lastName,
      photoURL,
    } = req.body;

    // Determine mode: if uid is provided, use Firebase; otherwise use JWT/PostgreSQL
    const isFirebaseMode = !!uid;

    if (isFirebaseMode) {
      // Firebase mode - original logic
      if (!uid || !email || !name) {
        return res.status(400).json({
          success: false,
          message: "UID, email, and name are required for Firebase mode",
        });
      }

      const db = getFirestore();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: "Firebase not configured. Use JWT registration instead.",
        });
      }

      // Check if user already exists
      const existingUser = await db.collection("users").doc(uid).get();
      if (existingUser.exists) {
        return res.status(400).json({
          success: false,
          message: "User already exists",
        });
      }

      // Create user document
      const userData = {
        uid,
        email,
        name,
        role: "user",
        photoURL: photoURL || null,
        phoneNumber: null,
        bio: null,
        location: null,
        totalFramesCreated: 0,
        totalPhotosDownloaded: 0,
        totalVideosDownloaded: 0,
        preferences: {
          defaultCamera: "user",
          defaultTimer: 3,
          autoSavePhotos: true,
          notificationsEnabled: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      await db.collection("users").doc(uid).set(userData);

      return res.status(201).json({
        success: true,
        message: "User registered successfully",
        user: userData,
      });
    }

    // JWT/PostgreSQL mode
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password diperlukan",
      });
    }

    // Build display name from various sources
    let finalDisplayName = displayName;
    if (!finalDisplayName && firstName) {
      finalDisplayName = lastName ? `${firstName} ${lastName}` : firstName;
    }
    if (!finalDisplayName && name) {
      finalDisplayName = name;
    }
    if (!finalDisplayName) {
      finalDisplayName = email.split("@")[0];
    }

    let user = null;
    let token = null;

    // Try PostgreSQL registration
    try {
      // Check if user exists
      const existingUser = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email sudah terdaftar",
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, display_name, role)
         VALUES ($1, $2, $3, 'user')
         RETURNING id, email, display_name, role`,
        [email.toLowerCase(), passwordHash, finalDisplayName]
      );

      user = result.rows[0];

      // Generate token
      token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      console.log(`✅ New user registered in database: ${user.email}`);
    } catch (dbError) {
      console.log(
        "⚠️  Database unavailable for registration, using in-memory mode"
      );
      console.log(
        "⚠️  User data will NOT persist after server restart! Install PostgreSQL for production."
      );

      // Hash password for temporary storage
      const passwordHash = await bcrypt.hash(password, 12);

      // Fallback: Create temporary user (stored in memory)
      const userId = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      user = {
        id: userId,
        email: email.toLowerCase(),
        display_name: finalDisplayName,
        password_hash: passwordHash,
        role: "user",
      };

      // Store in memory (will be lost on server restart)
      tempUsers.set(email.toLowerCase(), user);

      // Generate token
      token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      console.log(
        `⚠️  Temporary user created and stored in memory: ${user.email} (ID: ${userId})`
      );
      console.log(`⚠️  Total temporary users: ${tempUsers.size}`);
      console.log(
        `⚠️  User can login while server is running, but data will be lost on server restart.`
      );
    }

    res.status(201).json({
      success: true,
      message: "Registrasi berhasil",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      message: "Registrasi gagal. Coba lagi.",
    });
  }
});

/**
 * POST /api/auth/register-firebase (legacy endpoint)
 * Register new user using Firebase
 */
router.post(
  "/register-firebase",
  [
    body("uid").notEmpty().withMessage("UID is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("name").notEmpty().withMessage("Name is required"),
  ],
  validate,
  async (req, res) => {
    try {
      const { uid, email, name, photoURL } = req.body;
      const db = getFirestore();

      // Check if user already exists
      const existingUser = await db.collection("users").doc(uid).get();
      if (existingUser.exists) {
        return res.status(400).json({
          success: false,
          message: "User already exists",
        });
      }

      // Create user document
      const userData = {
        uid,
        email,
        name,
        role: "user",
        photoURL: photoURL || null,
        phoneNumber: null,
        bio: null,
        location: null,
        totalFramesCreated: 0,
        totalPhotosDownloaded: 0,
        totalVideosDownloaded: 0,
        preferences: {
          defaultCamera: "user",
          defaultTimer: 3,
          autoSavePhotos: true,
          notificationsEnabled: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      await db.collection("users").doc(uid).set(userData);

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        user: userData,
      });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to register user",
      });
    }
  }
);

/**
 * PUT /api/auth/update-profile
 * Update user profile
 */
router.put(
  "/update-profile",
  verifyToken,
  [
    body("name").optional().notEmpty().withMessage("Name cannot be empty"),
    body("bio").optional().isString(),
    body("location").optional().isString(),
  ],
  validate,
  async (req, res) => {
    try {
      const db = getFirestore();
      const { name, bio, location, phoneNumber, preferences } = req.body;

      const updates = {
        updatedAt: new Date().toISOString(),
      };

      if (name) updates.name = name;
      if (bio !== undefined) updates.bio = bio;
      if (location !== undefined) updates.location = location;
      if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
      if (preferences) updates.preferences = preferences;

      await db.collection("users").doc(req.user.uid).update(updates);

      res.json({
        success: true,
        message: "Profile updated successfully",
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update profile",
      });
    }
  }
);

export default router;
