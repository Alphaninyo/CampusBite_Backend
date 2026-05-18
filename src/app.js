const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const app = express();

// ─── Security & Utility Middleware ────────────────────────────────────────────

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'CampusBite API is running.',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ─── Route Mounts ────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth.routes'));
app.use('/api/vendors',  require('./routes/vendor.routes'));
app.use('/api/menu',     require('./routes/menu.routes'));
app.use('/api/orders',   require('./routes/order.routes'));
app.use('/api/payments', require('./routes/payment.routes'));

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An unexpected internal server error occurred.',
  });
});

module.exports = app;
