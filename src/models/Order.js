const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Order Model
 * CRITICAL: An Order row is ONLY created after M-Pesa payment is confirmed.
 * The status lifecycle is: Received → Preparing → Ready → Collected → In Transit → Delivered
 * rider_id is nullable because a rider is assigned AFTER the order is prepared.
 */
const Order = sequelize.define(
  'Order',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    consumer_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'vendors', key: 'id' },
    },
    rider_id: {
      type: DataTypes.UUID,
      allowNull: true, // Nullable — rider is assigned after vendor prepares the order
      references: { model: 'users', key: 'id' },
    },
    status: {
      type: DataTypes.ENUM(
        'Received',
        'Preparing',
        'Ready',
        'Collected',
        'In Transit',
        'Delivered'
      ),
      allowNull: false,
      defaultValue: 'Received',
    },
    food_subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Sum of (unit_price × quantity) for all order items.',
    },
    delivery_fee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'food_subtotal + delivery_fee. This is the exact amount charged via M-Pesa.',
    },
    delivery_address: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    has_issue: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'True once the consumer reports a delivery problem via "Report a problem".',
    },
    issue_reason: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'One of: not_delivered, wrong_items, missing_items, poor_quality, other.',
    },
    issue_note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    issue_reported_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    issue_resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'NULL = still open. Set by an admin resolving the report.',
    },
  },
  {
    tableName: 'orders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

module.exports = Order;
