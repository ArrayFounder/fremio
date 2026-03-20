import express from "express";
import pg from "pg";
import jwt from "jsonwebtoken";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "fremio_dev_secret_key";

// Database pool
const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "salwa",
  password: process.env.DB_PASSWORD || "",
});

// Generate short share ID
function generateShareId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Ensure user_drafts table exists (runs once at startup)
pool.query(`
  CREATE TABLE IF NOT EXISTS user_drafts (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    share_id VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(255) DEFAULT 'Untitled',
    frame_data TEXT,
    preview_url TEXT,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )
`).then(async () => {
  // Migrate user_id column from INTEGER to TEXT if needed (handles UUID/email user IDs)
  try {
    await pool.query(`
      ALTER TABLE user_drafts
        ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT
    `);
    console.log('✅ [Drafts] user_id column migrated to TEXT');
  } catch (e) {
    // Already TEXT or no change needed
  }
  pool.query('CREATE INDEX IF NOT EXISTS idx_user_drafts_share_id ON user_drafts(share_id)').catch(() => {});
  pool.query('CREATE INDEX IF NOT EXISTS idx_user_drafts_user_id ON user_drafts(user_id)').catch(() => {});
  console.log('✅ [Drafts] user_drafts table ready');
}).catch(err => {
  console.error('❌ [Drafts] Failed to create user_drafts table:', err.message);
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = { id: decoded.userId, email: decoded.email, role: decoded.role };
    next();
  });
};

// Public share endpoint - no auth required (for sharing frames)
router.post('/public-share', async (req, res) => {
  try {
    const { title, frameData, previewUrl } = req.body;
    const userId = null; // public shares are not tied to an authenticated user

    let parsedFrameData = null;
    try {
      parsedFrameData = JSON.parse(frameData);
    } catch (e) {
      console.warn('⚠️ [Drafts] Could not parse frameData:', e.message);
    }

    console.log('📤 [Drafts] PUBLIC share request:', {
      title,
      hasFrameData: !!frameData,
      frameDataLength: frameData?.length,
      parsedElements: parsedFrameData?.elements?.length,
      elementTypes: parsedFrameData?.elements?.map(el => el.type),
      hasBackground: parsedFrameData?.elements?.some(el => el.type === 'background-photo'),
      hasOverlay: parsedFrameData?.elements?.some(el => el.type === 'upload'),
    });

    if (!frameData) {
      return res.status(400).json({ error: 'Frame data is required' });
    }

    const shareId = generateShareId();
    const result = await pool.query(
      `INSERT INTO user_drafts (user_id, share_id, title, frame_data, preview_url, is_public)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [userId, shareId, title || 'Shared Frame', frameData, previewUrl]
    );

    console.log('✅ [Drafts] Created PUBLIC share:', result.rows[0].id, 'shareId:', shareId);
    res.json({ success: true, draft: result.rows[0] });
  } catch (error) {
    console.error('❌ [Drafts] Error creating public share:', error);
    res.status(500).json({ error: 'Failed to create share' });
  }
});

// Save draft (requires auth)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, frameData, previewUrl, draftId } = req.body;
    const userId = req.user.id;

    console.log('📝 [Drafts] Save draft request:', {
      userId,
      title,
      hasDraftId: !!draftId,
      hasFrameData: !!frameData
    });

    if (!frameData) {
      return res.status(400).json({ error: 'Frame data is required' });
    }

    // Check if updating existing draft
    if (draftId) {
      const existing = await pool.query(
        'SELECT * FROM user_drafts WHERE id = $1 AND user_id = $2',
        [draftId, userId]
      );

      if (existing.rows.length > 0) {
        // Update existing
        const result = await pool.query(
          `UPDATE user_drafts 
           SET title = $1, frame_data = $2, preview_url = $3, updated_at = NOW()
           WHERE id = $4 AND user_id = $5
           RETURNING *`,
          [title || 'Untitled', frameData, previewUrl, draftId, userId]
        );
        console.log('✅ [Drafts] Updated existing draft:', result.rows[0].id);
        return res.json({ success: true, draft: result.rows[0] });
      }
    }

    // Create new draft - ALWAYS set is_public = true for sharing
    const shareId = generateShareId();
    const result = await pool.query(
      `INSERT INTO user_drafts (user_id, share_id, title, frame_data, preview_url, is_public)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [userId, shareId, title || 'Untitled', frameData, previewUrl]
    );

    console.log('✅ [Drafts] Created new draft:', result.rows[0].id, 'shareId:', shareId);
    res.json({ success: true, draft: result.rows[0] });
  } catch (error) {
    console.error('❌ [Drafts] Error saving draft:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// Get user's drafts (requires auth)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📋 [Drafts] Fetching drafts for user:', userId);
    
    const result = await pool.query(
      `SELECT id, share_id, title, frame_data, preview_url, is_public, created_at, updated_at
       FROM user_drafts 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );
    
    console.log('✅ [Drafts] Found', result.rows.length, 'drafts');
    res.json({ success: true, drafts: result.rows });
  } catch (error) {
    console.error('❌ [Drafts] Error fetching drafts:', error);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

// Get draft by ID (for owner)
router.get('/by-id/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    console.log('🔍 [Drafts] Fetching draft by ID:', id);
    
    const result = await pool.query(
      'SELECT * FROM user_drafts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    res.json({ success: true, draft: result.rows[0] });
  } catch (error) {
    console.error('❌ [Drafts] Error fetching draft:', error);
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
});

// Get shared draft by share_id (public - no auth required)
router.get('/share/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    
    console.log('🔗 [Drafts] Fetching shared draft:', shareId);
    
    // Allow access to any draft with share_id (all user drafts are now shareable)
    const result = await pool.query(
      `SELECT id, share_id, title, frame_data, preview_url, created_at
       FROM user_drafts 
       WHERE share_id = $1`,
      [shareId]
    );

    if (result.rows.length === 0) {
      console.log('❌ [Drafts] Shared draft not found:', shareId);
      return res.status(404).json({ error: 'Frame not found' });
    }

    console.log('✅ [Drafts] Found shared draft:', result.rows[0].title);
    res.json({ success: true, draft: result.rows[0] });
  } catch (error) {
    console.error('❌ [Drafts] Error fetching shared draft:', error);
    res.status(500).json({ error: 'Failed to fetch frame' });
  }
});

// Delete draft
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log('🗑️ [Drafts] Deleting draft:', id);

    const result = await pool.query(
      'DELETE FROM user_drafts WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    console.log('✅ [Drafts] Deleted draft:', id);
    res.json({ success: true, message: 'Draft deleted' });
  } catch (error) {
    console.error('❌ [Drafts] Error deleting draft:', error);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// Toggle public/private
router.patch('/:id/visibility', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublic } = req.body;
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE user_drafts 
       SET is_public = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [isPublic, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    res.json({ success: true, draft: result.rows[0] });
  } catch (error) {
    console.error('❌ [Drafts] Error updating visibility:', error);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

export default router;
