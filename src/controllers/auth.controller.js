const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Op }  = require('sequelize');
const { User, Vendor, sequelize } = require('../models');
const emailService = require('../services/email.service');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Signs a JWT containing the user's UUID as the subject. */
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

/**
 * Builds and sends the standard auth response.
 * password_hash is never included in the response payload.
 */
const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user.id);

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id:          user.id,
      name:        user.name,
      email:       user.email,
      phone:       user.phone,
      role:        user.role,
      is_approved: user.is_approved,
      created_at:  user.created_at,
    },
  });
};

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Public — creates a new user account.
 *
 * Body: { name, email, phone, password, role? }
 *
 * Role rules:
 *  - consumer  → is_approved = true  (can start ordering immediately)
 *  - vendor    → is_approved = false (must await admin approval)
 *  - rider     → is_approved = false (must await admin approval)
 *  - admin role cannot be self-assigned via this endpoint
 */
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    // ── Validate required fields ───────────────────────────────────────────
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, phone, and password.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    // ── Role validation ────────────────────────────────────────────────────
    const allowedRoles = ['consumer', 'vendor', 'rider'];
    const userRole = role || 'consumer';

    if (!allowedRoles.includes(userRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Accepted values: consumer, vendor, rider.',
      });
    }

    // ── Duplicate email check ──────────────────────────────────────────────
    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // ── Hash password ──────────────────────────────────────────────────────
    // Salt rounds = 12: strong enough for production without being too slow
    const password_hash = await bcrypt.hash(password, 12);

    // ── Vendor-specific field validation ──────────────────────────────────────
    // Vendor business info is collected at registration so the admin can review
    // a complete profile before granting approval.
    if (userRole === 'vendor') {
      const { business_name, vendor_type } = req.body;
      if (!business_name || !vendor_type) {
        return res.status(400).json({
          success: false,
          message: 'Vendor registration requires business_name and vendor_type (restaurant | home_based).',
        });
      }
      if (!['restaurant', 'home_based'].includes(vendor_type)) {
        return res.status(400).json({
          success: false,
          message: 'vendor_type must be "restaurant" or "home_based".',
        });
      }
    }

    // ── Create User + Vendor profile atomically ────────────────────────────
    const t = await sequelize.transaction();
    let user;
    try {
      user = await User.create(
        {
          name:          name.trim(),
          email:         email.toLowerCase().trim(),
          phone:         phone.trim(),
          password_hash,
          role:          userRole,
          is_approved:   userRole === 'consumer', // only consumers are auto-approved
        },
        { transaction: t }
      );

      // Vendor profile is created in the same transaction as the user
      if (userRole === 'vendor') {
        await Vendor.create(
          {
            user_id:       user.id,
            business_name: req.body.business_name.trim(),
            vendor_type:   req.body.vendor_type,
            location:      req.body.location ? req.body.location.trim() : null,
            is_open:       false,
            approved_at:   null,
          },
          { transaction: t }
        );
      }

      await t.commit();
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }

    sendTokenResponse(user, 201, res);
  } catch (error) {
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: error.errors.map((e) => e.message).join(' | '),
      });
    }
    console.error('[AUTH] register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

/**
 * POST /api/auth/login
 * Public — authenticates a user and returns a JWT.
 *
 * Body: { email, password }
 *
 * Vendors and Riders that have not yet been approved receive a 403
 * with a descriptive message rather than a token.
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your email and password.',
      });
    }

    // ── Find user (using generic error to prevent email enumeration) ───────
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // ── Verify password ────────────────────────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // ── Approval gate for vendors and riders ───────────────────────────────
    if (['vendor', 'rider'].includes(user.role) && !user.is_approved) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval. You will be notified once it is activated.',
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error('[AUTH] login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

/**
 * GET /api/auth/me
 * Protected — returns the profile of the currently authenticated user.
 * req.user is populated by the protect middleware.
 */
exports.getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
};

/**
 * PUT /api/auth/profile
 * Protected — any authenticated user.
 * Updates name and/or phone. Email changes are not allowed (used as login identity).
 *
 * Body: { name?, phone? }
 */
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name && !phone) {
      return res.status(400).json({ success: false, message: 'Provide at least one field to update: name or phone.' });
    }

    const updates = {};
    if (name)  updates.name  = name.trim();
    if (phone) updates.phone = phone.trim();

    await User.update(updates, { where: { id: req.user.id } });
    const updated = await User.findByPk(req.user.id, { attributes: { exclude: ['password_hash', 'fcm_token', 'password_reset_otp', 'password_reset_expires'] } });

    res.status(200).json({ success: true, message: 'Profile updated.', user: updated });
  } catch (error) {
    console.error('[AUTH] updateProfile error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/auth/password
 * Protected — any authenticated user.
 * Changes the password after verifying the current one.
 *
 * Body: { current_password, new_password }
 */
exports.updatePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'current_password and new_password are required.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const user = await User.findByPk(req.user.id);
    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const password_hash = await bcrypt.hash(new_password, 12);
    await user.update({ password_hash });

    res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('[AUTH] updatePassword error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/auth/forgot-password
 * Public — initiates a password reset by sending a 6-digit OTP to the user's email.
 * The OTP is hashed before storage and expires in 10 minutes.
 *
 * Body: { email }
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await User.findOne({ where: { email: email.toLowerCase() } });

    // Always return 200 — prevents email enumeration attacks
    if (!user) {
      return res.status(200).json({ success: true, message: 'If that email is registered, a reset code has been sent.' });
    }

    const otp    = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const hashed = crypto.createHash('sha256').update(otp).digest('hex');
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await user.update({ password_reset_otp: hashed, password_reset_expires: expiry });

    await emailService.sendPasswordReset(user.email, user.name, otp);

    res.status(200).json({ success: true, message: 'If that email is registered, a reset code has been sent.' });
  } catch (error) {
    console.error('[AUTH] forgotPassword error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/auth/reset-password
 * Public — verifies the OTP and sets a new password.
 *
 * Body: { email, otp, new_password }
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, new_password } = req.body;
    if (!email || !otp || !new_password) {
      return res.status(400).json({ success: false, message: 'email, otp, and new_password are required.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const hashed = crypto.createHash('sha256').update(otp).digest('hex');

    const user = await User.findOne({
      where: {
        email:                email.toLowerCase(),
        password_reset_otp:     hashed,
        password_reset_expires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code.' });
    }

    const password_hash = await bcrypt.hash(new_password, 12);
    await user.update({
      password_hash,
      password_reset_otp:     null,
      password_reset_expires: null,
    });

    res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    console.error('[AUTH] resetPassword error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/auth/device-token
 * Protected — stores the caller's Firebase FCM token.
 * The mobile app calls this once after login so the backend can send push notifications.
 *
 * Body: { fcm_token: string }
 */
exports.updateDeviceToken = async (req, res) => {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) {
      return res.status(400).json({ success: false, message: 'fcm_token is required.' });
    }
    await User.update({ fcm_token }, { where: { id: req.user.id } });
    res.status(200).json({ success: true, message: 'Device token registered.' });
  } catch (error) {
    console.error('[AUTH] updateDeviceToken error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
