const express = require('express');
const router  = express.Router();

/**
 * GET /checkout/card
 * PUBLIC — no `protect` middleware, because this page is opened in a plain
 * browser tab (web) or a WebView (native), neither of which carry our app's
 * normal auth headers. The JWT is instead passed through as a query param
 * and used as a Bearer token by this page's own fetch() call.
 *
 * Renders a minimal Stripe Elements card form. Never touches the card
 * number itself — Stripe.js tokenizes it directly in the browser/WebView,
 * so our server only ever sees the PaymentIntent result.
 *
 * Query params: client_secret, publishable_key, payment_id, amount, token
 */
router.get('/card', (req, res) => {
  // helmet's default CSP (script-src 'self') blocks both js.stripe.com and this
  // page's own inline <script>. Every other route on this server is a JSON API
  // that never executes a CSP anyway, so scope the relaxed policy to just this
  // one HTML-serving route instead of loosening it globally.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://js.stripe.com 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "frame-src https://js.stripe.com; " +
    "connect-src 'self' https://api.stripe.com;"
  );

  const { client_secret, publishable_key, payment_id, amount, token } = req.query;

  if (!client_secret || !publishable_key || !payment_id || !token) {
    return res.status(400).send('Missing required checkout parameters.');
  }

  // JSON.stringify safely embeds these as JS string literals (escapes quotes,
  // backslashes, etc.) rather than naively interpolating into the template.
  const safe = {
    clientSecret:   JSON.stringify(client_secret),
    publishableKey: JSON.stringify(publishable_key),
    paymentId:      JSON.stringify(payment_id),
    token:          JSON.stringify(token),
    amount:         JSON.stringify(amount || ''),
  };

  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CampusBite Checkout</title>
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      background: #FFF8F6; margin: 0; padding: 24px;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
    }
    .card {
      background: #fff; border-radius: 16px; padding: 24px; width: 100%; max-width: 380px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    h2 { margin: 0 0 4px; color: #111827; font-size: 20px; }
    .sub { color: #6B7280; font-size: 13px; margin-bottom: 20px; }
    #card-element {
      border: 1px solid #F0F0F0; border-radius: 10px; padding: 14px; background: #F8F9FA;
    }
    button {
      width: 100%; margin-top: 20px; background: #E85D04; color: #fff; border: none;
      border-radius: 12px; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    #message { margin-top: 16px; font-size: 14px; text-align: center; color: #111827; min-height: 20px; }
    .test-note {
      margin-top: 16px; font-size: 12px; color: #92400E; background: #FFFBEB;
      border: 1px solid #FCD34D; border-radius: 8px; padding: 10px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>Pay KES ${amount || ''}</h2>
    <div class="sub">CampusBite secure checkout — powered by Stripe</div>
    <div id="card-element"></div>
    <button id="pay-btn">Pay Now</button>
    <div id="message"></div>
    <div class="test-note">Test mode — use card 4242 4242 4242 4242, any future expiry, any CVC.</div>
  </div>
  <script>
    const stripe   = Stripe(${safe.publishableKey});
    const elements = stripe.elements();
    const card     = elements.create('card', { hidePostalCode: true });
    card.mount('#card-element');

    const payBtn = document.getElementById('pay-btn');
    const msg    = document.getElementById('message');
    function setMessage(text) { msg.textContent = text; }

    payBtn.addEventListener('click', async () => {
      payBtn.disabled = true;
      setMessage('Processing payment…');

      const { error, paymentIntent } = await stripe.confirmCardPayment(${safe.clientSecret}, {
        payment_method: { card },
      });

      if (error) {
        setMessage(error.message);
        payBtn.disabled = false;
        return;
      }

      if (paymentIntent.status === 'succeeded') {
        setMessage('Payment confirmed — finalizing your order…');
        try {
          const res  = await fetch('/api/orders/confirm-card-payment/' + ${safe.paymentId}, {
            method:  'POST',
            headers: { 'Authorization': 'Bearer ' + ${safe.token} },
          });
          const data = await res.json();
          if (data.success) {
            setMessage('Order placed! You can close this window and return to the app.');
          } else {
            setMessage(data.message || 'Payment succeeded, but the order could not be finalized. Please contact support.');
            payBtn.disabled = false;
          }
        } catch (e) {
          setMessage('Payment succeeded, but we could not reach the server to finalize your order. Please contact support.');
          payBtn.disabled = false;
        }
      } else {
        setMessage('Payment status: ' + paymentIntent.status);
        payBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`);
});

module.exports = router;
