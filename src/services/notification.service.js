const admin = require('firebase-admin');

// Only initialize if all three Firebase env vars are present
const CONFIGURED = !!(
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
);

if (CONFIGURED) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // .env stores newlines as literal \n — restore them
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
} else {
  console.warn('[NOTIFY] Firebase env vars missing — push notifications disabled.');
}

/**
 * Send a push notification to a single device.
 * Silent no-op if Firebase is not configured or the token is missing.
 * Never throws — notification failure must never break the order/payment flow.
 *
 * @param {string|null} token - FCM device token stored on the User row
 * @param {string} title
 * @param {string} body
 * @param {object} [data] - Optional key-value payload for the app to consume
 */
async function send(token, title, body, data = {}) {
  if (!CONFIGURED || !token) return;
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data,
      android: { priority: 'high' },
      apns:    { payload: { aps: { sound: 'default', contentAvailable: true } } },
    });
  } catch (err) {
    console.warn('[NOTIFY] Push failed:', err.message);
  }
}

module.exports = { send };
