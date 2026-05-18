const { Review, Order, Vendor, User } = require('../models');

// ─── Consumer: Submit Review ──────────────────────────────────────────────────

/**
 * POST /api/reviews
 * Protected — consumer only.
 *
 * Rules:
 *  - Order must be Delivered
 *  - Consumer must own the order
 *  - One review per order (enforced by UNIQUE on order_id)
 *  - rider_rating is only accepted if a rider was assigned
 *
 * Body: { order_id, vendor_rating (1-5), rider_rating? (1-5), comment? }
 */
exports.createReview = async (req, res) => {
  try {
    const { order_id, vendor_rating, rider_rating, comment } = req.body;

    if (!order_id || !vendor_rating) {
      return res.status(400).json({ success: false, message: 'order_id and vendor_rating are required.' });
    }
    if (!Number.isInteger(vendor_rating) || vendor_rating < 1 || vendor_rating > 5) {
      return res.status(400).json({ success: false, message: 'vendor_rating must be an integer between 1 and 5.' });
    }
    if (rider_rating !== undefined && rider_rating !== null) {
      if (!Number.isInteger(rider_rating) || rider_rating < 1 || rider_rating > 5) {
        return res.status(400).json({ success: false, message: 'rider_rating must be an integer between 1 and 5.' });
      }
    }

    const order = await Order.findByPk(order_id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (order.consumer_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (order.status !== 'Delivered') {
      return res.status(400).json({ success: false, message: 'You can only review an order after it has been delivered.' });
    }

    const existing = await Review.findOne({ where: { order_id } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already reviewed this order.' });
    }

    const review = await Review.create({
      order_id,
      consumer_id:   req.user.id,
      vendor_id:     order.vendor_id,
      rider_id:      order.rider_id || null,
      vendor_rating,
      rider_rating:  order.rider_id ? (rider_rating ?? null) : null,
      comment:       comment?.trim() || null,
    });

    res.status(201).json({ success: true, message: 'Review submitted. Thank you!', review });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: 'You have already reviewed this order.' });
    }
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ success: false, message: error.errors.map((e) => e.message).join(' | ') });
    }
    console.error('[REVIEW] createReview error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Public: Vendor Reviews ───────────────────────────────────────────────────

/**
 * GET /api/reviews/vendor/:vendorId
 * Public — returns all reviews for a vendor with aggregate rating.
 */
exports.getVendorReviews = async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where:   { vendor_id: req.params.vendorId },
      include: [{ model: User, as: 'consumer', attributes: ['name'] }],
      order:   [['created_at', 'DESC']],
    });

    const avg =
      reviews.length > 0
        ? parseFloat((reviews.reduce((s, r) => s + r.vendor_rating, 0) / reviews.length).toFixed(1))
        : null;

    res.status(200).json({
      success:        true,
      total:          reviews.length,
      average_rating: avg,
      reviews,
    });
  } catch (error) {
    console.error('[REVIEW] getVendorReviews error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Consumer: Check Order Review ─────────────────────────────────────────────

/**
 * GET /api/reviews/order/:orderId
 * Protected — consumer only.
 * Lets the app check whether a review already exists for an order
 * so it knows whether to show the "Write a review" button.
 */
exports.getOrderReview = async (req, res) => {
  try {
    const review = await Review.findOne({ where: { order_id: req.params.orderId } });
    if (!review) {
      return res.status(404).json({ success: false, message: 'No review found for this order.' });
    }
    res.status(200).json({ success: true, review });
  } catch (error) {
    console.error('[REVIEW] getOrderReview error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
