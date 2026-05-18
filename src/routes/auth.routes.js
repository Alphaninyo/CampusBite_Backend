const express        = require('express');
const rateLimit      = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const { protect }    = require('../middleware/auth.middleware');

const router = express.Router();

// Strict limiter for sensitive auth actions — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
});

// ── Public routes ─────────────────────────────────────────────────────────────
router.post('/register',       authController.register);
router.post('/login',          authLimiter, authController.login);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password',  authController.resetPassword);

// ── Protected routes (valid JWT required) ─────────────────────────────────────
router.get( '/me',           protect, authController.getMe);
router.put( '/profile',      protect, authController.updateProfile);
router.put( '/password',     protect, authController.updatePassword);
router.put( '/device-token', protect, authController.updateDeviceToken);

module.exports = router;
