// Backend/scripts/init-auth-db.js - Initialize authentication tables
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const logger = require('../utils/logger');

require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function initAuthDB() {
  try {
    logger.info('🔐 Starting authentication database initialization...');

    // Read auth schema
    const schemaPath = path.join(__dirname, '..', 'db', 'auth-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by semicolon and filter empty statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Execute each statement
    for (const statement of statements) {
      try {
        await pool.query(statement);
        logger.info('✓ Executed: ' + statement.substring(0, 60) + '...');
      } catch (error) {
        if (error.message.includes('already exists')) {
          logger.info('⏭️  Already exists: ' + statement.substring(0, 60) + '...');
        } else {
          logger.error('Error executing statement:', { error: error.message });
          throw error;
        }
      }
    }

    logger.info('✅ Authentication database initialization complete!');
    process.exit(0);

  } catch (error) {
    logger.error('❌ Database initialization failed', { error: error.message });
    process.exit(1);
  }
}

initAuthDB();
