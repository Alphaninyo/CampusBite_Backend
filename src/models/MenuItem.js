const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * MenuItem Model
 * Represents a single food item on a vendor's menu.
 * Price is stored in KES (Kenyan Shillings) as a DECIMAL
 * to avoid floating-point rounding errors in financial calculations.
 */
const MenuItem = sequelize.define(
  'MenuItem',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'vendors', key: 'id' },
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Menu item name cannot be empty.' },
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: { args: [0], msg: 'Price cannot be negative.' },
        isDecimal: { msg: 'Price must be a valid decimal number.' },
      },
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Vendor can mark items as unavailable without deleting them.',
    },
  },
  {
    tableName: 'menu_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

module.exports = MenuItem;
