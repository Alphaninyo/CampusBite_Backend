const { sequelize, User, Vendor, Order, Payment, Review } = require('../models');
const { Op } = require('sequelize');

// ─── Stats Overview ───────────────────────────────────────────────────────────

/**
 * GET /api/admin/stats
 * Admin only — platform-wide numbers for a dashboard overview.
 */
exports.getStats = async (req, res) => {
  try {
    const [
      totalOrders,
      ordersByStatus,
      confirmedRevenue,
      totalConsumers,
      totalVendors,
      totalRiders,
      pendingVendors,
      totalReviews,
    ] = await Promise.all([
      Order.count(),
      Order.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        ],
        group: ['status'],
        raw:   true,
      }),
      Payment.sum('amount', { where: { status: 'confirmed' } }),
      User.count({ where: { role: 'consumer' } }),
      User.count({ where: { role: 'vendor' } }),
      User.count({ where: { role: 'rider' } }),
      Vendor.count({ where: { approved_at: null } }),
      Review.count(),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        orders: {
          total:     totalOrders,
          by_status: ordersByStatus,
        },
        revenue: {
          confirmed_total: parseFloat(confirmedRevenue || 0).toFixed(2),
        },
        users: {
          consumers:       totalConsumers,
          vendors:         totalVendors,
          riders:          totalRiders,
          pending_vendors: pendingVendors,
        },
        reviews: {
          total: totalReviews,
        },
      },
    });
  } catch (error) {
    console.error('[ADMIN] getStats error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── All Orders ───────────────────────────────────────────────────────────────

/**
 * GET /api/admin/orders
 * Admin only — paginated list of all orders.
 * Query params: ?status=Received&page=1&limit=20
 */
exports.getAllOrders = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.status) where.status = req.query.status;

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      include: [
        { model: User,   as: 'consumer', attributes: ['name', 'phone'] },
        { model: Vendor, as: 'vendor',   attributes: ['business_name'] },
        { model: User,   as: 'rider',    attributes: ['name', 'phone'] },
      ],
      order:  [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      total:   count,
      page,
      pages:   Math.ceil(count / limit),
      orders,
    });
  } catch (error) {
    console.error('[ADMIN] getAllOrders error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── All Users ────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * Admin only — paginated user list.
 * Query params: ?role=rider&page=1&limit=20
 */
exports.getAllUsers = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.role) where.role = req.query.role;

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash', 'fcm_token'] },
      order:      [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      total:   count,
      page,
      pages:   Math.ceil(count / limit),
      users,
    });
  } catch (error) {
    console.error('[ADMIN] getAllUsers error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
