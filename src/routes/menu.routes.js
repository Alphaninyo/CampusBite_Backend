const express        = require('express');
const menuController = require('../controllers/menu.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/vendor/:vendorId', menuController.getVendorMenu);

// ── Vendor only ───────────────────────────────────────────────────────────────
router.post(  '/',           protect, restrictTo('vendor'), menuController.addMenuItem);
router.put(   '/:id',        protect, restrictTo('vendor'), menuController.updateMenuItem);
router.patch( '/:id/toggle', protect, restrictTo('vendor'), menuController.toggleItemAvailability);
router.delete('/:id',        protect, restrictTo('vendor'), menuController.deleteMenuItem);

module.exports = router;
