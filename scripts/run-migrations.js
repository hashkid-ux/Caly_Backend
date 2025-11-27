#!/usr/bin/env node
// Backend/scripts/run-migrations.js
// Run database migrations

const fs = require('fs');
const path = require('path');
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    // Check if migrations table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get all migration files
    const migrationsDir = path.join(__dirname, '../db/migrations');
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('No migrations directory found');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Check if migration already ran
      const result = await db.query(
        'SELECT * FROM migrations WHERE name = $1',
        [file]
      );

      if (result.rows.length > 0) {
        logger.info(`Migration already executed: ${file}`);
        continue;
      }

      // Read and execute migration
      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf-8');

      logger.info(`Executing migration: ${file}`);
      await db.query(sql);

      // Mark migration as executed
      await db.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        [file]
      );

      logger.info(`✓ Migration completed: ${file}`);
    }

    logger.info('All migrations completed successfully!');
    process.exit(0);

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
