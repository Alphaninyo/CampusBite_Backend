const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * OrderItem Model
 * Junction table linking an Order to specific MenuItems.
 * unit_price is snapshotted at checkout time so that future
 * price changes on the menu item do not alter historical orders.
 */
const OrderItem = sequelize.define(
  'OrderItem',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    order_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'orders', key: 'id' },
    },
    menu_item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'menu_items', key: 'id' },
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: { args: [1], msg: 'Quantity must be at least 1.' },
      },
    },
    unit_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Price snapshot at the moment of purchase. Immutable after creation.',
    },
  },
  {
    tableName: 'order_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

module.exports = OrderItem;
