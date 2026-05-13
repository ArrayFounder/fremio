const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, generateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register new user
 */
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Email tidak valid'),
  body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
  body('displayName').optional().trim().isLength({ min: 2, max: 50 })
], async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, displayName } = req.body;

    // Check if user exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, email, display_name, role, created_at`,
      [email.toLowerCase(), passwordHash, displayName || email.split('@')[0]]
    );

    const user = result.rows[0];

    // Generate token
    const token = generateToken(user);

    console.log(`✅ New user registered: ${user.email}`);

    res.status(201).json({
      message: 'Registrasi berhasil',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role
      },
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registrasi gagal. Coba lagi.' });
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Email atau password tidak valid' });
    }

    const { email, password } = req.body;

    // Find user
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const user = result.rows[0];

    // Check password — OAuth user tanpa password tidak bisa login via credentials
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Akun ini tidak mendukung login password. Gunakan Google Sign-in.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Generate token
    const token = generateToken(user);

    console.log(`✅ User logged in: ${user.email}`);

    res.json({
      message: 'Login berhasil',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        photoUrl: user.photo_url
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login gagal. Coba lagi.' });
  }
});

/**
 * GET /api/auth/me
 * Get current logged in user
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, display_name, role, photo_url, created_at 
       FROM users WHERE id = $1 AND is_active = true`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      photoUrl: user.photo_url,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Gagal mengambil data user' });
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticateToken, [
  body('displayName').optional().trim().isLength({ min: 2, max: 50 }),
  body('photoUrl').optional().isURL()
], async (req, res) => {
  try {
    const { displayName, photoUrl } = req.body;

    const result = await db.query(
      `UPDATE users 
       SET display_name = COALESCE($2, display_name),
           photo_url = COALESCE($3, photo_url),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, role, photo_url`,
      [req.user.userId, displayName, photoUrl]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    res.json({
      message: 'Profile berhasil diupdate',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Gagal update profile' });
  }
});

/**
 * PUT /api/auth/password
 * Change password
 */
router.put('/password', authenticateToken, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get current user
    const userResult = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Password saat ini salah' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1',
      [req.user.userId, newPasswordHash]
    );

    res.json({ message: 'Password berhasil diubah' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Gagal mengubah password' });
  }
});

/**
 * POST /api/auth/google
 * Google OAuth login
 */
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential diperlukan' });
    }

    // Verifikasi token dengan Google
    const tokenResponse = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${credential}`
    );
    const payload = await tokenResponse.json();

    if (!tokenResponse.ok || !payload.email) {
      return res.status(401).json({ error: 'Token Google tidak valid' });
    }

    const email = payload.email.toLowerCase();
    const displayName = payload.name || email.split('@')[0];
    const photoUrl = payload.picture || null;

    // Cari user
    let result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    let user;
    if (result.rows.length === 0) {
      // Buat user baru (OAuth tanpa password)
      result = await db.query(
        `INSERT INTO users (email, password_hash, display_name, photo_url, role, is_active)
         VALUES ($1, NULL, $2, $3, 'user', true)
         RETURNING id, email, display_name, role, photo_url, created_at`,
        [email, displayName, photoUrl]
      );
      console.log(`✅ New Google user registered: ${email}`);
    } else {
      user = result.rows[0];
      if (!user.is_active) {
        return res.status(403).json({ error: 'Akun dinonaktifkan' });
      }
      // Update photo_url kalau berubah
      if (photoUrl && user.photo_url !== photoUrl) {
        await db.query(
          'UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2',
          [photoUrl, user.id]
        );
        user.photo_url = photoUrl;
      }
    }

    user = result.rows[0];
    const token = generateToken(user);

    res.json({
      message: 'Login Google berhasil',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        photoUrl: user.photo_url
      },
      token
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ error: 'Login Google gagal. Coba lagi.' });
  }
});

/**
 * POST /api/auth/reset-password
 * Request password reset email
 */
router.post('/reset-password', [
  body('email').isEmail().normalizeEmail().withMessage('Email tidak valid')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Email tidak valid' });
    }

    const { email } = req.body;
    const normalizedEmail = email.toLowerCase();

    // Check if user exists
    const userResult = await db.query(
      'SELECT id, email, display_name FROM users WHERE email = $1 AND is_active = true',
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal if email exists or not for security
      return res.json({
        message: 'Jika email terdaftar, instruksi reset password akan dikirim'
      });
    }

    const user = userResult.rows[0];

    // Generate reset token (valid for 1 hour)
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save reset token to database
    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_expiry = $2, updated_at = NOW() WHERE id = $3',
      [resetToken, resetTokenExpiry, user.id]
    );

    // TODO: Send email with reset link
    // For now, just log the token (in production, implement email service)
    console.log(`🔑 Password reset token for ${user.email}: ${resetToken}`);
    console.log(`🔗 Reset link: ${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`);

    res.json({
      message: 'Instruksi reset password telah dikirim ke email Anda',
      // Include token in development for testing
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Gagal memproses permintaan reset password' });
  }
});

/**
 * POST /api/auth/confirm-reset
 * Confirm password reset with token
 */
router.post('/confirm-reset', [
  body('token').notEmpty().withMessage('Token diperlukan'),
  body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Token atau password tidak valid' });
    }

    const { token, password } = req.body;

    // Find user with valid reset token
    const userResult = await db.query(
      'SELECT id, email, reset_token_expiry FROM users WHERE reset_token = $1 AND is_active = true',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Token reset tidak valid atau sudah kadaluarsa' });
    }

    const user = userResult.rows[0];

    // Check if token is still valid
    if (new Date() > new Date(user.reset_token_expiry)) {
      return res.status(400).json({ error: 'Token reset sudah kadaluarsa' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and clear reset token
    await db.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL, updated_at = NOW() WHERE id = $2',
      [passwordHash, user.id]
    );

    console.log(`✅ Password reset completed for user: ${user.email}`);

    res.json({
      message: 'Password berhasil direset. Silakan login dengan password baru.'
    });

  } catch (error) {
    console.error('Confirm reset error:', error);
    res.status(500).json({ error: 'Gagal mereset password' });
  }
});

module.exports = router;
