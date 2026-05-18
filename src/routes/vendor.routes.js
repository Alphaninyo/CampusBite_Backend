const express          = require('express');
const vendorController = require('../controllers/vendor.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// ─── IMPORTANT: Specific static routes MUST be declared before /:id ───────────
// Express matches routes top-to-bottom. If /:id came first, requests to
// /admin/pending or /profile/me would be caught by the :id wildcard instead.

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get(  '/admin/pending',     protect, restrictTo('admin'), vendorController.getPendingVendors);
router.patch('/admin/:id/approve', protect, restrictTo('admin'), vendorController.approveVendor);

// ── Vendor profile routes (authenticated vendor only) ─────────────────────────
router.post( '/profile',           protect, restrictTo('vendor'), vendorController.createProfile);
router.get(  '/profile/me',        protect, restrictTo('vendor'), vendorController.getMyProfile);
router.put(  '/profile/me',        protect, restrictTo('vendor'), vendorController.updateMyProfile);
router.patch('/profile/me/toggle', protect, restrictTo('vendor'), vendorController.toggleShopStatus);

// ── Public routes ─────────────────────────────────────────────────────────────
router.get('/',    vendorController.getAllVendors);
router.get('/:id', vendorController.getVendorById); // Must be last — catches all remaining GETs

module.exports = router;
