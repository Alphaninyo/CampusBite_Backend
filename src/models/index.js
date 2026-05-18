const sequelize = require('../config/database');

const User      = require('./User');
const Vendor    = require('./Vendor');
const MenuItem  = require('./MenuItem');
const Order     = require('./Order');
const OrderItem = require('./OrderItem');
const Payment   = require('./Payment');
const Review    = require('./Review');

// ─── Associations ─────────────────────────────────────────────────────────────

// A User who is a vendor has ONE Vendor profile
User.hasOne(Vendor, { foreignKey: 'user_id', as: 'vendorProfile' });
Vendor.belongsTo(User, { foreignKey: 'user_id', as: 'owner' });

// A Vendor has MANY menu items
Vendor.hasMany(MenuItem, { foreignKey: 'vendor_id', as: 'menuItems' });
MenuItem.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });

// A Consumer (User) has MANY orders placed
User.hasMany(Order, { foreignKey: 'consumer_id', as: 'ordersAsConsumer' });
Order.belongsTo(User, { foreignKey: 'consumer_id', as: 'consumer' });

// A Rider (User) has MANY orders assigned for delivery
User.hasMany(Order, { foreignKey: 'rider_id', as: 'ordersAsRider' });
Order.belongsTo(User, { foreignKey: 'rider_id', as: 'rider' });

// A Vendor has MANY orders directed to them
Vendor.hasMany(Order, { foreignKey: 'vendor_id', as: 'orders' });
Order.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });

// An Order has MANY order items (the individual food lines)
Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// An OrderItem references ONE menu item (for name/description lookups)
MenuItem.hasMany(OrderItem, { foreignKey: 'menu_item_id', as: 'orderItems' });
OrderItem.belongsTo(MenuItem, { foreignKey: 'menu_item_id', as: 'menuItem' });

// An Order has ONE payment record
Order.hasOne(Payment, { foreignKey: 'order_id', as: 'payment' });
Payment.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// An Order has ONE review (written by the consumer after delivery)
Order.hasOne(Review, { foreignKey: 'order_id', as: 'review' });
Review.belongsTo(Order,  { foreignKey: 'order_id',   as: 'order' });
Review.belongsTo(User,   { foreignKey: 'consumer_id', as: 'consumer' });
Review.belongsTo(Vendor, { foreignKey: 'vendor_id',   as: 'vendor' });
Review.belongsTo(User,   { foreignKey: 'rider_id',    as: 'rider' });

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  sequelize,
  User,
  Vendor,
  MenuItem,
  Order,
  OrderItem,
  Payment,
  Review,
};
