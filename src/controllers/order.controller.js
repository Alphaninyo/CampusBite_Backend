const mpesaService = require('../services/mpesa.service');
const notify       = require('../services/notification.service');
const { sequelize, Order, OrderItem, MenuItem, Vendor, User, Payment } = require('../models');

// ─── Constants ────────────────────────────────────────────────────────────────

const DELIVERY_FEE = 50.00; // Flat KES 50 per order. Phase 5 can make this dynamic.

/**
 * Status transition map.
 * Defines the ONLY valid next status for each current status, and which role
 * is permitted to trigger that transition. Any deviation returns a 403/400.
 *
 * Lifecycle: Received → Preparing → Ready → Collected → In Transit → Delivered
 */
const TRANSITIONS = {
  'Received':   { next: 'Preparing',  role: 'vendor' },
  'Preparing':  { next: 'Ready',      role: 'vendor' },
  'Ready':      { next: 'Collected',  role: 'rider'  },
  'Collected':  { next: 'In Transit', role: 'rider'  },
  'In Transit': { next: 'Delivered',  role: 'rider'  },
};

// ─── Internal Helper ──────────────────────────────────────────────────────────

/**
 * createOrderFromPayment
 * ──────────────────────
 * Reads a confirmed Payment's cart_data and atomically creates:
 *   1. An Order row
 *   2. All OrderItem rows (one per cart line)
 *
 * EXPORTED so Phase 5's M-Pesa callback handler can import and call this
 * without duplicating logic.
 *
 * @param {Payment} payment - A Sequelize Payment instance with cart_data populated
 * @param {Transaction} t   - An active Sequelize transaction (caller manages commit/rollback)
 * @returns {Promise<Order>} The newly created Order instance
 */
exports.createOrderFromPayment = async (payment, t) => {
  const {
    consumer_id,
    vendor_id,
    items,
    delivery_address,
    food_subtotal,
    delivery_fee,
    total_amount,
  } = payment.cart_data;

  const order = await Order.create(
    {
      consumer_id,
      vendor_id,
      rider_id:         null, // assigned later by a rider
      status:           'Received',
      food_subtotal,
      delivery_fee,
      total_amount,
      delivery_address,
    },
    { transaction: t }
  );

  // Snapshot each cart line into order_items
  const orderItems = items.map((item) => ({
    order_id:     order.id,
    menu_item_id: item.menu_item_id,
    quantity:     item.quantity,
    unit_price:   item.unit_price,
  }));

  await OrderItem.bulkCreate(orderItems, { transaction: t });

  return order;
};

// ─── Consumer: Initiate Checkout ──────────────────────────────────────────────

/**
 * POST /api/orders/initiate
 * Protected — consumer only.
 *
 * Step 1 of the payment-first order flow:
 *   - Validates the cart against the live DB (vendor open, items available, correct vendor)
 *   - Snapshots prices to prevent manipulation between cart and payment
 *   - Creates a pending Payment record (stores cart as JSONB for later retrieval)
 *   - Returns the checkout summary and a checkout_request_id
 *
 * Phase 5 will insert the real STK Push call between validation and Payment creation.
 *
 * Body: {
 *   vendor_id:        UUID,
 *   items:            [{ menu_item_id: UUID, quantity: number }],
 *   delivery_address: string
 * }
 */
exports.initiateCheckout = async (req, res) => {
  try {
    const { vendor_id, items, delivery_address } = req.body;

    // ── Basic input validation ─────────────────────────────────────────────
    if (!vendor_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide vendor_id and a non-empty items array.',
      });
    }
    if (!delivery_address || !delivery_address.trim()) {
      return res.status(400).json({ success: false, message: 'delivery_address is required.' });
    }

    // ── Vendor validation ──────────────────────────────────────────────────
    const vendor = await Vendor.findByPk(vendor_id);
    if (!vendor || !vendor.approved_at) {
      return res.status(404).json({ success: false, message: 'Vendor not found or not yet approved.' });
    }
    if (!vendor.is_open) {
      return res.status(400).json({ success: false, message: `"${vendor.business_name}" is currently closed.` });
    }

    // ── Validate each item and snapshot prices ─────────────────────────────
    const cartItems   = [];
    let food_subtotal = 0;

    for (const entry of items) {
      const { menu_item_id, quantity } = entry;

      if (!menu_item_id || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: 'Each cart item must have a valid menu_item_id and an integer quantity ≥ 1.',
        });
      }

      const menuItem = await MenuItem.findByPk(menu_item_id);
      if (!menuItem || !menuItem.is_available) {
        return res.status(400).json({
          success: false,
          message: `Menu item "${menu_item_id}" is unavailable or does not exist.`,
        });
      }
      if (menuItem.vendor_id !== vendor_id) {
        return res.status(400).json({
          success: false,
          message: `"${menuItem.name}" does not belong to this vendor.`,
        });
      }

      const unit_price = parseFloat(menuItem.price);
      food_subtotal   += unit_price * quantity;

      cartItems.push({ menu_item_id, name: menuItem.name, quantity, unit_price });
    }

    food_subtotal      = parseFloat(food_subtotal.toFixed(2));
    const delivery_fee = DELIVERY_FEE;
    const total_amount = parseFloat((food_subtotal + delivery_fee).toFixed(2));

    // ── Initiate STK Push ──────────────────────────────────────────────────
    // Cart validation is complete. Call Safaricom — outside any DB transaction
    // because network calls must not hold locks.
    let stkResponse;
    try {
      stkResponse = await mpesaService.initiateSTKPush({
        phone:       req.user.phone,
        amount:      total_amount,
        accountRef:  vendor.business_name,
        description: 'Food Order',
      });
    } catch (mpesaError) {
      console.error('[ORDER] STK Push failed:', mpesaError.message);
      return res.status(503).json({
        success: false,
        message: 'M-Pesa service is currently unavailable. Please try again shortly.',
      });
    }

    // ── Create pending Payment record ──────────────────────────────────────
    // The real Safaricom CheckoutRequestID is used here (replaces Phase 4 UUID).
    // The cart is stored as JSONB so the callback handler can create the order
    // without re-fetching anything.
    const payment = await Payment.create({
      checkout_request_id: stkResponse.CheckoutRequestID,
      amount:              total_amount,
      status:              'pending',
      cart_data: {
        consumer_id:      req.user.id,
        vendor_id,
        items:            cartItems,
        delivery_address: delivery_address.trim(),
        food_subtotal,
        delivery_fee,
        total_amount,
      },
    });

    res.status(200).json({
      success: true,
      message: 'STK Push sent. Check your phone and enter your M-Pesa PIN to confirm your order.',
      checkout_request_id: payment.checkout_request_id,
      payment_id:          payment.id,
      summary: {
        vendor:           vendor.business_name,
        items:            cartItems,
        food_subtotal,
        delivery_fee,
        total_amount,
        delivery_address: delivery_address.trim(),
      },
    });
  } catch (error) {
    console.error('[ORDER] initiateCheckout error:', error);
    res.status(500).json({ success: false, message: 'Server error during checkout.' });
  }
};

// ─── DEV-ONLY: Simulate M-Pesa Callback ──────────────────────────────────────

/**
 * POST /api/orders/dev-confirm/:checkoutRequestId
 * Protected — consumer only. DEV / TESTING USE ONLY.
 *
 * Simulates a successful M-Pesa STK Push callback so the full order flow
 * can be tested without a real Safaricom integration.
 *
 * This endpoint will be REMOVED and replaced by the real M-Pesa callback
 * handler (POST /api/payments/callback) in Phase 5.
 */
exports.devConfirmPayment = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, message: 'Route not found.' });
  }
  const t = await sequelize.transaction();
  try {
    const payment = await Payment.findOne({
      where: { checkout_request_id: req.params.checkoutRequestId },
      transaction: t,
    });

    if (!payment) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Checkout session not found.' });
    }
    if (payment.status !== 'pending') {
      await t.rollback();
      return res.status(409).json({ success: false, message: `Payment already ${payment.status}.` });
    }
    if (!payment.cart_data) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'No cart data found for this payment.' });
    }

    // Create the Order and OrderItems — same logic Phase 5 will use
    const order = await exports.createOrderFromPayment(payment, t);

    await payment.update(
      {
        status:       'confirmed',
        order_id:     order.id,
        mpesa_ref:    `DEV-${Date.now()}`, // Phase 5 uses real M-Pesa transaction ID
        confirmed_at: new Date(),
        cart_data:    null,                // Cart no longer needed once Order exists
      },
      { transaction: t }
    );

    await t.commit();

    res.status(201).json({
      success:  true,
      message:  'Payment confirmed. Order created successfully.',
      order_id: order.id,
      order,
    });
  } catch (error) {
    await t.rollback();
    console.error('[ORDER] devConfirmPayment error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Consumer Endpoints ───────────────────────────────────────────────────────

/**
 * GET /api/orders
 * Protected — consumer only.
 * Lists all orders placed by the authenticated consumer, newest first.
 */
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { consumer_id: req.user.id },
      include: [
        { model: Vendor,    as: 'vendor',  attributes: ['business_name', 'location'] },
        { model: OrderItem, as: 'items',
          include: [{ model: MenuItem, as: 'menuItem', attributes: ['name'] }] },
        { model: Payment,   as: 'payment', attributes: ['mpesa_ref', 'status', 'confirmed_at'] },
      ],
      order: [['created_at', 'DESC']],
    });

    res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('[ORDER] getMyOrders error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Shared: Single Order Detail ─────────────────────────────────────────────

/**
 * GET /api/orders/:id
 * Protected — consumer, vendor, rider, or admin.
 * Returns full detail for a single order with access control enforced:
 *   - Consumer: must own the order
 *   - Vendor: must own the shop the order was placed at
 *   - Rider: must be the assigned rider
 *   - Admin: unrestricted
 */
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id, {
      include: [
        { model: User,    as: 'consumer', attributes: ['name', 'phone'] },
        { model: Vendor,  as: 'vendor',   attributes: ['business_name', 'location'] },
        { model: User,    as: 'rider',    attributes: ['name', 'phone'] },
        { model: OrderItem, as: 'items',
          include: [{ model: MenuItem, as: 'menuItem', attributes: ['name', 'price'] }] },
        { model: Payment, as: 'payment',  attributes: ['mpesa_ref', 'status', 'confirmed_at'] },
      ],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const { role, id: userId } = req.user;

    if (role === 'consumer' && order.consumer_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (role === 'rider' && order.rider_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (role === 'vendor') {
      const vendorProfile = await Vendor.findOne({ where: { user_id: userId } });
      if (!vendorProfile || vendorProfile.id !== order.vendor_id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('[ORDER] getOrderById error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Vendor Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /api/orders/vendor
 * Protected — vendor only.
 * Lists all orders directed to the authenticated vendor's shop.
 * Optional filter: ?status=Received
 */
exports.getVendorOrders = async (req, res) => {
  try {
    const vendorProfile = await Vendor.findOne({ where: { user_id: req.user.id } });
    if (!vendorProfile) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found.' });
    }

    const where = { vendor_id: vendorProfile.id };
    if (req.query.status) where.status = req.query.status;

    const orders = await Order.findAll({
      where,
      include: [
        { model: User,      as: 'consumer', attributes: ['name', 'phone'] },
        { model: OrderItem, as: 'items',
          include: [{ model: MenuItem, as: 'menuItem', attributes: ['name'] }] },
      ],
      order: [['created_at', 'DESC']],
    });

    res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('[ORDER] getVendorOrders error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PATCH /api/orders/:id/status
 * Protected — vendor or rider.
 *
 * Advances the order to the next status. The transition map is strict:
 * each status has exactly one valid next state and one authorized role.
 *
 *   Vendor: Received → Preparing → Ready
 *   Rider:  Collected → In Transit → Delivered
 */
exports.updateOrderStatus = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findByPk(req.params.id, { transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const transition = TRANSITIONS[order.status];
    if (!transition) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Order is already delivered. No further updates possible.' });
    }
    if (req.user.role !== transition.role) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: `Only a ${transition.role} can advance an order from "${order.status}" to "${transition.next}".`,
      });
    }

    // Vendor must own the shop this order belongs to
    if (req.user.role === 'vendor') {
      const vendorProfile = await Vendor.findOne({ where: { user_id: req.user.id }, transaction: t });
      if (!vendorProfile || vendorProfile.id !== order.vendor_id) {
        await t.rollback();
        return res.status(403).json({ success: false, message: 'This order does not belong to your shop.' });
      }
    }

    // Rider must be assigned to this specific order before updating status
    if (req.user.role === 'rider') {
      if (!order.rider_id) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Assign yourself to this order before updating its status.',
        });
      }
      if (order.rider_id !== req.user.id) {
        await t.rollback();
        return res.status(403).json({ success: false, message: 'You are not assigned to this order.' });
      }
    }

    const previousStatus = order.status;
    await order.update({ status: transition.next }, { transaction: t });
    await t.commit();

    // Fire-and-forget push notifications per transition
    const CONSUMER_MESSAGES = {
      'Preparing':  ['Being Prepared',  'Your order is being prepared.'],
      'Ready':      ['Order Ready',     'Your order is ready and waiting for a rider.'],
      'Collected':  ['Rider Collected', 'A rider has collected your order!'],
      'In Transit': ['On the Way!',     'Your order is on its way to you.'],
      'Delivered':  ['Delivered!',      'Your order has arrived. Enjoy your meal!'],
    };
    const msg = CONSUMER_MESSAGES[transition.next];
    if (msg) {
      User.findByPk(order.consumer_id, { attributes: ['fcm_token'] })
        .then((u) => notify.send(u?.fcm_token, msg[0], msg[1], { order_id: order.id }))
        .catch(console.error);
    }
    // Notify vendor when rider collects
    if (transition.next === 'Collected') {
      User.findByPk(req.user.id, { attributes: ['name'] }).then((rider) =>
        Vendor.findByPk(order.vendor_id, { include: [{ model: User, as: 'owner', attributes: ['fcm_token'] }] })
          .then((v) => notify.send(v?.owner?.fcm_token, 'Order Collected', `${rider?.name ?? 'Rider'} has collected the order.`, { order_id: order.id }))
      ).catch(console.error);
    }

    res.status(200).json({
      success:       true,
      message:       `Order advanced: "${previousStatus}" → "${transition.next}"`,
      order_id:      order.id,
      new_status:    transition.next,
    });
  } catch (error) {
    await t.rollback();
    console.error('[ORDER] updateOrderStatus error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Rider Endpoints ──────────────────────────────────────────────────────────

/**
 * GET /api/orders/rider/available
 * Protected — rider only.
 * Returns all "Ready" orders that have no rider assigned yet.
 * Riders browse this list to choose a delivery.
 */
exports.getAvailableOrders = async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { status: 'Ready', rider_id: null },
      include: [
        { model: Vendor, as: 'vendor',   attributes: ['business_name', 'location'] },
        { model: User,   as: 'consumer', attributes: ['name', 'phone'] },
        { model: OrderItem, as: 'items',
          include: [{ model: MenuItem, as: 'menuItem', attributes: ['name'] }] },
      ],
      order: [['created_at', 'ASC']], // oldest first — fairness for vendors waiting
    });

    res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('[ORDER] getAvailableOrders error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PATCH /api/orders/:id/assign-rider
 * Protected — rider only.
 * The authenticated rider self-assigns to a "Ready" order.
 * Uses a transaction to prevent two riders claiming the same order simultaneously.
 */
exports.assignRider = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findByPk(req.params.id, { transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (order.status !== 'Ready') {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot assign: order status is "${order.status}" (must be "Ready").`,
      });
    }
    if (order.rider_id) {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'A rider is already assigned to this order.' });
    }

    await order.update({ rider_id: req.user.id }, { transaction: t });
    await t.commit();

    // Notify the vendor that a rider is coming
    User.findByPk(req.user.id, { attributes: ['name'] }).then((rider) =>
      Vendor.findByPk(order.vendor_id, { include: [{ model: User, as: 'owner', attributes: ['fcm_token'] }] })
        .then((v) => notify.send(v?.owner?.fcm_token, 'Rider Assigned', `${rider?.name ?? 'A rider'} is on the way to collect the order.`, { order_id: order.id }))
    ).catch(console.error);

    res.status(200).json({
      success:  true,
      message:  'You are now assigned. Head to the vendor to collect the order.',
      order_id: order.id,
    });
  } catch (error) {
    await t.rollback();
    console.error('[ORDER] assignRider error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/orders/rider/mine
 * Protected — rider only.
 * Lists all orders currently assigned to the authenticated rider.
 * Optional filter: ?status=In Transit
 */
exports.getRiderOrders = async (req, res) => {
  try {
    const where = { rider_id: req.user.id };
    if (req.query.status) where.status = req.query.status;

    const orders = await Order.findAll({
      where,
      include: [
        { model: Vendor, as: 'vendor',   attributes: ['business_name', 'location'] },
        { model: User,   as: 'consumer', attributes: ['name', 'phone'] },
      ],
      order: [['created_at', 'DESC']],
    });

    res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('[ORDER] getRiderOrders error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
