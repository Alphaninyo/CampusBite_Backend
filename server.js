require('dotenv').config();

const app           = require('./src/app');
const { sequelize } = require('./src/models');

const PORT = process.env.PORT || 5000;

/**
 * Database Connection & Server Bootstrap
 *
 * sync({ alter: true }) — In development, Sequelize will ALTER existing tables
 * to match model definitions without dropping data.
 * Use { force: true } ONLY to wipe and recreate all tables (dangerous in production).
 */
async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('[DB] PostgreSQL connection established successfully.');

    // sync() creates tables that don't exist; skips tables that already do.
    // Use { force: true } only once to wipe + rebuild (destructive).
    // Avoid { alter: true } in development — it conflicts with UNIQUE constraints.
    await sequelize.sync();
    console.log('[DB] All models synchronized with the database.');

    app.listen(PORT, () => {
      console.log(`[SERVER] CampusBite API running on http://localhost:${PORT}`);
      console.log(`[SERVER] Environment: ${process.env.NODE_ENV}`);
      console.log(`[SERVER] Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('[FATAL] Unable to start the server:', error);
    process.exit(1);
  }
}

startServer();
