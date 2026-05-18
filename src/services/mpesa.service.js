const axios = require('axios');

const BASE_URL =
  process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

// Module-level token cache — survives across requests in the same process
let _cache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  if (_cache.token && Date.now() < _cache.expiresAt - 30_000) {
    return _cache.token;
  }

  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const { data } = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  _cache = {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return _cache.token;
}

// YYYYMMDDHHmmss in East Africa Time (UTC+3)
function getTimestamp() {
  const eat = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return eat.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
}

// Normalize any Kenyan phone format to 2547XXXXXXXX
function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0'))   return `254${digits.slice(1)}`;
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('+'))   return digits.slice(1);
  return digits;
}

/**
 * Sends an STK Push (Lipa Na M-Pesa Online) request to Safaricom.
 *
 * @param {object} opts
 * @param {string} opts.phone       - Consumer's phone number (any Kenyan format)
 * @param {number} opts.amount      - Total amount in KES (rounded up to nearest integer)
 * @param {string} opts.accountRef  - Shown on the customer's M-Pesa statement (≤ 12 chars)
 * @param {string} opts.description - Short transaction description (≤ 13 chars)
 * @returns {Promise<object>} Safaricom STK Push response (contains CheckoutRequestID)
 * @throws {Error} If the STK Push request is rejected by Safaricom
 */
async function initiateSTKPush({ phone, amount, accountRef, description }) {
  const token     = await getAccessToken();
  const timestamp = getTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE;
  const password  = Buffer.from(
    `${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString('base64');

  const { data } = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: shortcode,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(amount),        // M-Pesa only accepts whole numbers
      PartyA:            formatPhone(phone),
      PartyB:            shortcode,
      PhoneNumber:       formatPhone(phone),
      CallBackURL:       process.env.MPESA_CALLBACK_URL,
      AccountReference:  accountRef.slice(0, 12),
      TransactionDesc:   description.slice(0, 13),
    },
    {
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  // Safaricom returns ResponseCode "0" (a string) on success
  if (data.ResponseCode !== '0') {
    throw new Error(data.ResponseDescription || 'STK Push rejected by Safaricom');
  }

  return data; // caller needs data.CheckoutRequestID
}

module.exports = { initiateSTKPush };
