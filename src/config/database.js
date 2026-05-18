const { Sequelize } = require('sequelize');
require('dotenv').config();

/**
 * Sequelize instance configured for PostgreSQL.
 * Connection parameters are loaded from environment variables
 * to keep credentials out of source control.
 */
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,        // Maximum number of connections in pool
      min: 0,         // Minimum number of connections in pool
      acquire: 30000, // Max ms to try acquiring a connection before throwing error
      idle: 10000,    // Max ms a connection can be idle before being released
    },
  }
);

module.exports = sequelize;
