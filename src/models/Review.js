const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Review = sequelize.define(
  'Review',
  {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    order_id: {
      type:       DataTypes.UUID,
      allowNull:  false,
      unique:     true, // one review per order
      references: { model: 'orders', key: 'id' },
    },
    consumer_id: {
      type:       DataTypes.UUID,
      allowNull:  false,
      references: { model: 'users', key: 'id' },
    },
    vendor_id: {
      type:       DataTypes.UUID,
      allowNull:  false,
      references: { model: 'vendors', key: 'id' },
    },
    rider_id: {
      type:       DataTypes.UUID,
      allowNull:  true,
      references: { model: 'users', key: 'id' },
    },
    vendor_rating: {
      type:      DataTypes.INTEGER,
      allowNull: false,
      validate:  { min: 1, max: 5 },
    },
    rider_rating: {
      type:      DataTypes.INTEGER,
      allowNull: true,
      validate:  { min: 1, max: 5 },
    },
    comment: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName:  'reviews',
    timestamps: true,
    createdAt:  'created_at',
    updatedAt:  'updated_at',
    underscored: true,
  }
);

module.exports = Review;
