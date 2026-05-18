const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * User Model
 * Central authentication table for all actors in the system.
 * A single user can hold one of four roles: consumer, vendor, rider, or admin.
 * Vendors and Riders additionally require admin approval (is_approved).
 */
const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Name cannot be empty.' },
        len: { args: [2, 100], msg: 'Name must be between 2 and 100 characters.' },
      },
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: { msg: 'This email address is already registered.' },
      validate: {
        isEmail: { msg: 'Please provide a valid email address.' },
      },
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Phone number cannot be empty.' },
      },
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('consumer', 'vendor', 'rider', 'admin'),
      allowNull: false,
      defaultValue: 'consumer',
    },
    is_approved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Relevant for vendor and rider roles. Consumers are auto-approved.',
    },
    fcm_token: {
      type:      DataTypes.STRING(512),
      allowNull: true,
      comment:   'Firebase Cloud Messaging device token. Updated by the app on each login.',
    },
    password_reset_otp: {
      type:      DataTypes.STRING(255),
      allowNull: true,
      comment:   'SHA-256 hash of the 6-digit OTP sent to the user\'s email.',
    },
    password_reset_expires: {
      type:      DataTypes.DATE,
      allowNull: true,
      comment:   'Expiry timestamp for the password reset OTP (10 minutes from issue).',
    },
  },
  {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

module.exports = User;
