const express         = require('express');
const adminController = require('../controllers/admin.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// All admin routes require a valid JWT + admin role
router.use(protect, restrictTo('admin'));

router.get('/stats',   adminController.getStats);
router.get('/orders',  adminController.getAllOrders);
router.get('/users',   adminController.getAllUsers);
router.get('/vendors', adminController.getAllVendors);

module.exports = router;
