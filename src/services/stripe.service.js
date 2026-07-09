const Stripe = require('stripe');

// Placeholder detection mirrors the M-Pesa dev-fallback pattern in
// order.controller.js — no real key configured means we run in dev mode
// instead of calling out to Stripe.
function isConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_SECRET_KEY !== 'your_stripe_secret_key'
  );
}

let _stripe = null;
function client() {
  if (!_stripe) _stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// Stripe wants the amount in the currency's smallest unit (cents for KES).
function toSubunits(amount) {
  return Math.round(parseFloat(amount) * 100);
}

async function createPaymentIntent({ amount, description }) {
  const intent = await client().paymentIntents.create({
    amount:               toSubunits(amount),
    currency:             'kes',
    description,
    automatic_payment_methods: { enabled: true },
  });
  return intent;
}

async function retrievePaymentIntent(id) {
  return client().paymentIntents.retrieve(id);
}

module.exports = { isConfigured, createPaymentIntent, retrievePaymentIntent, toSubunits };
