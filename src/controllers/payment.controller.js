const { sequelize, Payment, Order, User, Vendor } = require('../models');
const { createOrderFromPayment }                  = require('./order.controller');
const notify                                      = require('../services/notification.service');

// ─── Safaricom STK Push Callback ──────────────────────────────────────────────

/**
 * POST /api/payments/callback
 * PUBLIC — no auth. Called directly by Safaricom servers after the customer
 * approves or cancels the STK Push prompt on their phone.
 *
 * Critical contract:
 *  - Must return HTTP 200 immediately regardless of processing outcome.
 *    Safaricom will retry several times if it receives anything else.
 *  - ResultCode 0 → payment succeeded → create the order atomically.
 *  - Any other ResultCode → payment failed/cancelled → mark as failed.
 *  - Idempotent: if the payment is already confirmed/failed, silently accept.
 */
exports.handleCallback = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const callback = req.body?.Body?.stkCallback;

    if (!callback) {
      await t.rollback();
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const { CheckoutRequestID, ResultCode, CallbackMetadata } = callback;

    const payment = await Payment.findOne({
      where:       { checkout_request_id: CheckoutRequestID },
      transaction: t,
    });

    // Unknown or already-processed — safe to acknowledge
    if (!payment || payment.status !== 'pending') {
      await t.rollback();
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    if (ResultCode !== 0) {
      // User cancelled or payment failed
      await payment.update({ status: 'failed' }, { transaction: t });
      await t.commit();
      console.log(`[MPESA] Payment failed. CheckoutRequestID: ${CheckoutRequestID} ResultCode: ${ResultCode}`);
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    // ── Payment confirmed ──────────────────────────────────────────────────
    const metaItems = CallbackMetadata?.Item || [];
    const mpesa_ref = metaItems.find((i) => i.Name === 'MpesaReceiptNumber')?.Value ?? null;

    const order = await createOrderFromPayment(payment, t);

    await payment.update(
      {
        status:       'confirmed',
        order_id:     order.id,
        mpesa_ref,
        confirmed_at: new Date(),
        cart_data:    null, // cart snapshot no longer needed
      },
      { transaction: t }
    );

    await t.commit();
    console.log(`[MPESA] Payment confirmed. Order ${order.id} created. Receipt: ${mpesa_ref}`);

    // Fire-and-forget notifications — failures must never affect the response to Safaricom
    const { consumer_id, vendor_id, total_amount } = cartData;
    Promise.all([
      User.findByPk(consumer_id, { attributes: ['fcm_token'] }),
      Vendor.findByPk(vendor_id, { include: [{ model: User, as: 'owner', attributes: ['name', 'fcm_token'] }] }),
      User.findByPk(consumer_id, { attributes: ['name'] }),
    ]).then(([consumer, vendor, consumerUser]) => {
      notify.send(consumer?.fcm_token, 'Order Confirmed!', `Payment of KES ${total_amount} received. Your order is being prepared.`, { order_id: order.id });
      notify.send(vendor?.owner?.fcm_token, 'New Order!', `${consumerUser?.name ?? 'A customer'} placed a new order.`, { order_id: order.id });
    }).catch(console.error);

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    await t.rollback();
    console.error('[MPESA] Callback processing error:', error);
    // Always 200 — Safaricom must not retry due to our internal errors
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
};

// ─── Consumer: Poll Payment Status ───────────────────────────────────────────

/**
 * GET /api/payments/status/:checkoutRequestId
 * Protected — consumer only.
 *
 * Allows the mobile app to poll after the STK Push is sent so it knows
 * when to navigate to the order confirmation screen.
 *
 * Ownership check:
 *  - Pending payments: verified via cart_data.consumer_id
 *  - Confirmed payments: verified via the linked order's consumer_id
 *  - Failed payments with no cart_data: returns status without ownership check
 *    (no sensitive data is exposed for failed payments)
 */
exports.getPaymentStatus = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      where: { checkout_request_id: req.params.checkoutRequestId },
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Checkout session not found.' });
    }

    // Ownership check
    if (payment.cart_data) {
      if (payment.cart_data.consumer_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    } else if (payment.order_id) {
      const order = await Order.findByPk(payment.order_id, { attributes: ['consumer_id'] });
      if (!order || order.consumer_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    res.status(200).json({
      success:   true,
      status:    payment.status,
      order_id:  payment.order_id,
      mpesa_ref: payment.mpesa_ref,
    });
  } catch (error) {
    console.error('[PAYMENT] getPaymentStatus error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Consumer: Cancel Pending Payment ────────────────────────────────────────

/**
 * POST /api/payments/:checkoutRequestId/cancel
 * Protected — consumer only.
 *
 * Marks a pending payment as failed so no order will be created even if
 * Safaricom's callback arrives late. The consumer should also decline the
 * STK Push prompt on their phone to avoid an unmatched M-Pesa deduction.
 *
 * Only pending payments can be cancelled — confirmed/failed ones are immutable.
 */
exports.cancelPayment = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      where: { checkout_request_id: req.params.checkoutRequestId },
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Checkout session not found.' });
    }

    // Verify ownership via cart_data
    if (!payment.cart_data || payment.cart_data.consumer_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (payment.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: `Cannot cancel — payment is already ${payment.status}.`,
      });
    }

    await payment.update({ status: 'failed', cart_data: null });

    res.status(200).json({
      success: true,
      message: 'Payment cancelled. Please also decline the M-Pesa prompt on your phone if it appears.',
    });
  } catch (error) {
    console.error('[PAYMENT] cancelPayment error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
