const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Vendor Model
 * Represents a food seller on the platform — either a physical restaurant
 * or a home-based seller. Always linked to a User record (user_id FK).
 */
const Vendor = sequelize.define(
  'Vendor',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    business_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Business name cannot be empty.' },
      },
    },
    vendor_type: {
      type: DataTypes.ENUM('restaurant', 'home_based'),
      allowNull: false,
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Text description of the vendor location on or near campus.',
    },
    is_open: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Vendor toggles this to accept or pause incoming orders.',
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp when admin approved this vendor profile.',
    },
  },
  {
    tableName: 'vendors',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

module.exports = Vendor;
