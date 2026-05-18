const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Payment Model
 * Records every M-Pesa STK Push transaction attempt.
 *
 * Lifecycle:
 *  1. STK Push initiated  → record created with status: 'pending'
 *  2. Safaricom callback (success) → status: 'confirmed', order row created
 *  3. Safaricom callback (failure) → status: 'failed', order NOT created
 *
 * checkout_request_id: Safaricom's ID for the STK Push session (used to match callback).
 * mpesa_ref: Safaricom's final transaction reference (only present on confirmed payments).
 */
const Payment = sequelize.define(
  'Payment',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    order_id: {
      type: DataTypes.UUID,
      allowNull: true, // Nullable — order doesn't exist until payment is confirmed
      references: { model: 'orders', key: 'id' },
    },
    mpesa_ref: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
      comment: 'The M-Pesa transaction ID (e.g., QKA71YDE2N). Set on confirmation.',
    },
    checkout_request_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: 'Safaricom CheckoutRequestID used to correlate the STK Push callback.',
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'The exact amount sent to the STK Push prompt (food + delivery fee).',
    },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    cart_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Snapshot of the cart at checkout time. Stored here so the order can be created when the M-Pesa callback arrives. Nullified after the order is created.',
    },
    confirmed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp of Safaricom callback confirmation.',
    },
  },
  {
    tableName: 'payments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

module.exports = Payment;
