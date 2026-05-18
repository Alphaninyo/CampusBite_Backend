const express          = require('express');
const reviewController = require('../controllers/review.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/vendor/:vendorId', reviewController.getVendorReviews);

// ── Consumer ──────────────────────────────────────────────────────────────────
router.post('/',                protect, restrictTo('consumer'), reviewController.createReview);
router.get('/order/:orderId',   protect, restrictTo('consumer'), reviewController.getOrderReview);

module.exports = router;
