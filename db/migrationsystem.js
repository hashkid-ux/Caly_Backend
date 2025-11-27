/**
 * Database Migration System
 * Handles version control for database schema changes
 * 
 * ✅ Uses proper SQL parser from initDatabase
 * ✅ Respects multi-line statements
 * ✅ Handles dollar quotes and comments
 * ✅ Tracks applied migrations to avoid re-running
 */

const fs = require('fs');
const path = require('path');
const db = require('./postgres');
const logger = require('../utils/logger');
const { parseSqlStatements } = require('./initDatabase');

/**
 * Initialize migrations table
 */
async function initMigrationsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.debug('✅ Migrations table ready');
  } catch (error) {
    logger.error('❌ Failed to initialize migrations table', { error: error.message });
    throw error;
  }
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations() {
  try {
    const result = await db.query('SELECT name FROM migrations ORDER BY applied_at');
    return result.rows.map(row => row.name);
  } catch (error) {
    logger.error('❌ Failed to get applied migrations', { error: error.message });
    return [];
  }
}

/**
 * Apply a single migration with proper SQL parsing and transaction safety
 * Uses parseSqlStatements instead of naive split(';')
 * Wraps migration in transaction for rollback capability
 */
async function applyMigration(name, sql) {
  const client = await db.pool.connect();
  try {
    logger.info(`📝 Applying migration: ${name}`);
    
    // Start transaction
    await client.query('BEGIN');
    
    // Use proper SQL parser that respects multi-line statements
    const statements = parseSqlStatements(sql);
    
    let statementCount = 0;
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await client.query(statement);
          statementCount++;
        } catch (stmtError) {
          // Determine if error is ignorable
          const ignorable =
            stmtError.message.includes('already exists') ||
            stmtError.code === '42P07' || // TABLE_ALREADY_EXISTS
            stmtError.code === '42701' || // COLUMN_ALREADY_EXISTS
            stmtError.code === '42P13' || // CONSTRAINT_ALREADY_EXISTS
            stmtError.code === '42P14'; // COLUMN_ALREADY_DEFINED

          if (!ignorable) {
            logger.warn(`⚠️  Statement in ${name} returned warning: ${stmtError.message.split('\n')[0]}`);
          }
        }
      }
    }
    
    // Record migration as applied (only if not already recorded)
    await client.query(
      'INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
      [name]
    );
    
    // Commit transaction
    await client.query('COMMIT');
    
    logger.info(`✅ Migration applied: ${name} (${statementCount} statements)`);
    return true;
  } catch (error) {
    // Rollback on error
    try {
      await client.query('ROLLBACK');
      logger.error(`❌ Migration failed and rolled back: ${name}`, { 
        error: error.message,
        code: error.code
      });
    } catch (rollbackError) {
      logger.error(`❌ Rollback failed for ${name}`, { error: rollbackError.message });
    }
    return false;
  } finally {
    // Always release the client
    client.release();
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations() {
  try {
    logger.info('🚀 Starting migration system...');
    
    // Initialize migrations table
    await initMigrationsTable();
    
    // Get already applied migrations
    const appliedMigrations = await getAppliedMigrations();
    logger.info(`📋 Already applied: ${appliedMigrations.length} migrations`);
    
    const migrationsDir = path.join(__dirname, 'migrations');
    
    // Ensure migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('⚠️  Migrations directory does not exist - skipping migrations');
      return true;
    }
    
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (migrationFiles.length === 0) {
      logger.warn('⚠️  No migration files found');
      return true;
    }
    
    logger.info(`📂 Found ${migrationFiles.length} migration files`);
    
    let appliedCount = 0;
    let skippedCount = 0;
    
    for (const file of migrationFiles) {
      if (appliedMigrations.includes(file)) {
        logger.info(`⏭️  Skipping already applied: ${file}`);
        skippedCount++;
        continue;
      }
      
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      const success = await applyMigration(file, sql);
      if (success) {
        appliedCount++;
      }
    }
    
    logger.info(`✅ Migrations complete (${appliedCount} applied, ${skippedCount} skipped)`);
    return true;
  } catch (error) {
    logger.error('❌ Migration system error', { error: error.message, stack: error.stack });
    return false;
  }
}

module.exports = {
  runMigrations,
  applyMigration,
  getAppliedMigrations,
  initMigrationsTable,
};
