const express            = require('express');
const paymentController  = require('../controllers/payment.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// ── Public — Safaricom posts here; no JWT auth ────────────────────────────────
router.post('/callback', paymentController.handleCallback);

// ── Consumer — poll payment status / cancel pending payment ───────────────────
router.get( '/status/:checkoutRequestId', protect, restrictTo('consumer'), paymentController.getPaymentStatus);
router.post('/:checkoutRequestId/cancel', protect, restrictTo('consumer'), paymentController.cancelPayment);

module.exports = router;
