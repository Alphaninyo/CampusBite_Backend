const express            = require('express');
const paymentController  = require('../controllers/payment.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// ── Public — Safaricom posts here; no JWT auth ────────────────────────────────
router.post('/callback', paymentController.handleCallback);

// ── Consumer — poll payment status after STK Push ─────────────────────────────
router.get('/status/:checkoutRequestId', protect, restrictTo('consumer'), paymentController.getPaymentStatus);

module.exports = router;
