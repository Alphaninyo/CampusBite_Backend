const express        = require('express');
const authController = require('../controllers/auth.controller');
const { protect }    = require('../middleware/auth.middleware');

const router = express.Router();

// ── Public routes (no token required) ────────────────────────────────────────
router.post('/register', authController.register);
router.post('/login',    authController.login);

// ── Protected routes (valid JWT required) ────────────────────────────────────
router.get('/me',           protect, authController.getMe);
router.put('/device-token', protect, authController.updateDeviceToken);

module.exports = router;
