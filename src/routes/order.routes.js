const express         = require('express');
const orderController = require('../controllers/order.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// ─── IMPORTANT: All static paths must come before dynamic /:id routes ─────────

// ── Consumer ──────────────────────────────────────────────────────────────────
router.post('/initiate',                       protect, restrictTo('consumer'),        orderController.initiateCheckout);
router.post('/dev-confirm/:checkoutRequestId', protect, restrictTo('consumer'),        orderController.devConfirmPayment);
router.post('/confirm-card-payment/:paymentId', protect, restrictTo('consumer'),       orderController.confirmCardPayment);
router.get( '/',                               protect, restrictTo('consumer'),        orderController.getMyOrders);
router.patch('/:id/report-issue',              protect, restrictTo('consumer'),        orderController.reportIssue);

// ── Vendor ────────────────────────────────────────────────────────────────────
router.get( '/vendor',                         protect, restrictTo('vendor'),          orderController.getVendorOrders);

// ── Rider ─────────────────────────────────────────────────────────────────────
router.get( '/rider/available',                protect, restrictTo('rider'),           orderController.getAvailableOrders);
router.get( '/rider/mine',                     protect, restrictTo('rider'),           orderController.getRiderOrders);
router.patch('/:id/assign-rider',              protect, restrictTo('rider'),           orderController.assignRider);

// ── Shared (access control enforced inside controller) ────────────────────────
router.get(  '/:id',      protect, orderController.getOrderById);
router.patch('/:id/status', protect, restrictTo('vendor', 'rider'), orderController.updateOrderStatus);

module.exports = router;
