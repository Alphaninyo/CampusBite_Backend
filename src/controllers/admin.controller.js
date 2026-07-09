const { sequelize, User, Vendor, Order, Payment, Review, MenuItem } = require('../models');
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

/**
 * PATCH /api/admin/orders/:id/resolve-issue
 * Admin only — marks a consumer-reported delivery issue as resolved.
 */
exports.resolveOrderIssue = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (!order.has_issue) {
      return res.status(400).json({ success: false, message: 'This order has no reported issue.' });
    }
    if (order.issue_resolved_at) {
      return res.status(400).json({ success: false, message: 'This issue has already been resolved.' });
    }

    await order.update({ issue_resolved_at: new Date() });
    res.status(200).json({ success: true, message: 'Issue marked as resolved.', order });
  } catch (error) {
    console.error('[ADMIN] resolveOrderIssue error:', error);
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

// ─── All Vendors ──────────────────────────────────────────────────────────────

/**
 * GET /api/admin/vendors
 * Admin only — all vendor profiles with owner info and approval status.
 * Query params: ?approved=true|false&page=1&limit=25
 */
exports.getAllVendors = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 25);
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.approved === 'true')  where.approved_at = { [Op.ne]: null };
    if (req.query.approved === 'false') where.approved_at = null;

    const { count, rows: vendors } = await Vendor.findAndCountAll({
      where,
      include: [
        { model: User, as: 'owner', attributes: ['name', 'email', 'phone', 'is_approved'] },
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
      vendors,
    });
  } catch (error) {
    console.error('[ADMIN] getAllVendors error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
