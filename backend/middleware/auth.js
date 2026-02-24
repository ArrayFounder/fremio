import jwt from "jsonwebtoken";
import { getAuth } from "../config/firebase.js";
import pg from "pg";

const JWT_SECRET = process.env.JWT_SECRET || "fremio_dev_secret_key";

// Database connection for role checking
const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

/**
 * Verify JWT Token or Firebase ID Token
 * Supports both for backwards compatibility
 */
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split("Bearer ")[1];

    // First, try to verify as JWT
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        uid: decoded.userId,
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        temp: decoded.temp, // Preserve temp flag for password setup
      };
      return next();
    } catch (jwtError) {
      // JWT failed, try Firebase if available
      try {
        const auth = getAuth();
        if (auth) {
          const decodedToken = await auth.verifyIdToken(token);
          req.user = {
            uid: decodedToken.uid,
            userId: decodedToken.uid,
            email: decodedToken.email,
            role: decodedToken.role || "user",
          };
          return next();
        }
      } catch (firebaseError) {
        // Firebase also failed
      }
    }

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

/**
 * Check if user is admin
 */
export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check role from JWT token first
    if (req.user.role === "admin") {
      req.userRole = "admin";
      return next();
    }

    // If no role in token, check database
    try {
      const result = await pool.query(
        "SELECT role FROM users WHERE id = $1 OR email = $2",
        [req.user.userId, req.user.email]
      );

      if (result.rows.length > 0 && result.rows[0].role === "admin") {
        req.user.role = "admin";
        req.userRole = "admin";
        return next();
      }
    } catch (dbError) {
      console.error("Database check failed:", dbError);
    }

    // Fallback to Firebase Firestore if available
    try {
      const { getFirestore } = await import("../config/firebase.js");
      const firestore = getFirestore();
      if (firestore) {
        const userDoc = await firestore.collection("users").doc(req.user.uid).get();
        if (userDoc.exists && userDoc.data().role === "admin") {
          req.userRole = "admin";
          return next();
        }
      }
    } catch (firestoreError) {
      // Firestore not available
    }

    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  } catch (error) {
    console.error("Admin check failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify admin status",
    });
  }
};

/**
 * Check if user is kreator or admin
 */
export const requireKreator = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const role = req.user.role;
    if (role === "kreator" || role === "admin") {
      req.userRole = role;
      return next();
    }

    // Check database
    try {
      const result = await pool.query(
        "SELECT role FROM users WHERE id = $1 OR email = $2",
        [req.user.userId, req.user.email]
      );

      if (result.rows.length > 0) {
        const dbRole = result.rows[0].role;
        if (dbRole === "kreator" || dbRole === "admin") {
          req.user.role = dbRole;
          req.userRole = dbRole;
          return next();
        }
      }
    } catch (dbError) {
      console.error("Database check failed:", dbError);
    }

    return res.status(403).json({
      success: false,
      message: "Kreator or admin access required",
    });
  } catch (error) {
    console.error("Kreator check failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify kreator status",
    });
  }
};

/**
 * Optional authentication - continues even if no token
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split("Bearer ")[1];

      // Try JWT first
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
          uid: decoded.userId,
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
        };
      } catch (jwtError) {
        // Try Firebase
        try {
          const auth = getAuth();
          if (auth) {
            const decodedToken = await auth.verifyIdToken(token);
            req.user = decodedToken;
          }
        } catch (firebaseError) {
          // Continue without user
        }
      }
    }

    next();
  } catch (error) {
    // Continue without user context
    next();
  }
};

export default { verifyToken, requireAdmin, requireKreator, optionalAuth };
