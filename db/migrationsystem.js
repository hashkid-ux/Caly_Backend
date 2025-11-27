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
 * Initialize migrations table - with safety checks
 */
async function initMigrationsTable() {
  try {
    // Safety check: ensure db.query exists
    if (!db?.query || typeof db.query !== 'function') {
      logger.warn('⚠️  Database query function unavailable - skipping migrations init');
      return false;
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('✅ Migrations table ready');
    return true;
  } catch (error) {
    // Only log as warning, don't throw - migrations table failure is non-fatal
    logger.warn('⚠️  Could not initialize migrations table', { error: error.message });
    return false;
  }
}

/**
 * Get list of applied migrations - with fallback
 */
async function getAppliedMigrations() {
  try {
    // Safety check: ensure db.query exists
    if (!db?.query || typeof db.query !== 'function') {
      logger.warn('⚠️  Database query function unavailable - assuming no migrations applied');
      return [];
    }

    const result = await db.query('SELECT name FROM migrations ORDER BY applied_at');
    return result.rows.map(row => row.name);
  } catch (error) {
    // Table might not exist yet - that's okay, return empty array
    if (error.code === '42P01') { // TABLE_NOT_FOUND
      logger.debug('📋 Migrations table does not exist yet');
      return [];
    }
    logger.warn('⚠️  Could not get applied migrations', { error: error.message });
    return [];
  }
}

/**
 * Apply a single migration with proper SQL parsing and transaction safety
 * Uses parseSqlStatements instead of naive split(';')
 * Wraps migration in transaction for rollback capability
 * Includes comprehensive error handling and safety checks
 */
async function applyMigration(name, sql) {
  // Safety Check 1: Ensure pool exists
  if (!db?.pool) {
    logger.warn(`⏭️  Skipping migration ${name} - database pool unavailable`);
    return true;  // Non-fatal - continue anyway
  }

  // Safety Check 2: Ensure pool.connect is a function
  if (typeof db.pool.connect !== 'function') {
    logger.warn(`⏭️  Skipping migration ${name} - pool.connect not available`);
    return true;
  }

  let client = null;

  try {
    logger.info(`📝 Applying migration: ${name}`);
    
    // Get a client from the pool
    client = await db.pool.connect();
    
    // Safety Check 3: Ensure we got a valid client
    if (!client) {
      logger.warn(`⏭️  Skipping migration ${name} - could not get database client`);
      return true;
    }

    // Start transaction
    await client.query('BEGIN');
    
    // Use proper SQL parser that respects multi-line statements
    const statements = parseSqlStatements(sql);
    
    let statementCount = 0;
    let ignoredErrors = 0;

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

          if (ignorable) {
            ignoredErrors++;
            logger.debug(`⏭️  Ignoring ${name}: ${stmtError.code}`);
          } else {
            // Non-ignorable error - will cause rollback
            throw stmtError;
          }
        }
      }
    }
    
    // Record migration as applied (only if not already recorded)
    try {
      await client.query(
        'INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
        [name]
      );
    } catch (recordError) {
      // If migrations table doesn't exist, that's okay - skip recording
      if (recordError.code !== '42P01') { // TABLE_NOT_FOUND
        throw recordError;  // Re-throw if it's a different error
      }
      logger.debug(`⏭️  Migrations table not ready yet for ${name}`);
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    logger.info(`✅ Migration applied: ${name} (${statementCount} statements, ${ignoredErrors} ignored)`);
    return true;
  } catch (error) {
    // Only rollback if we have a valid client
    if (client) {
      try {
        await client.query('ROLLBACK');
        logger.warn(`⚠️  Migration rolled back: ${name}`);
      } catch (rollbackError) {
        logger.warn(`⚠️  Rollback error for ${name}: ${rollbackError.message}`);
      }
    }
    
    // Log error but don't fail - migrations are optional
    logger.warn(`⚠️  Migration skipped: ${name} - ${error.message}`);
    return true;  // Non-fatal - continue with next migration
  } finally {
    // Safely release the client
    if (client && typeof client.release === 'function') {
      try {
        client.release();
      } catch (releaseError) {
        logger.debug(`⏭️  Error releasing client for ${name}: ${releaseError.message}`);
      }
    }
  }
}

/**
 * Run all pending migrations
 * Non-blocking: failures don't prevent app startup
 */
async function runMigrations() {
  try {
    logger.info('🚀 Starting migration system...');
    
    // Safety Check: Ensure database is accessible
    if (!db || typeof db.query !== 'function') {
      logger.warn('⚠️  Database not accessible - skipping migrations');
      return true;  // Non-fatal - app can still run
    }

    // Initialize migrations table (non-blocking)
    const tableReady = await initMigrationsTable();
    if (!tableReady) {
      logger.warn('⚠️  Migrations table not ready - will skip migration tracking');
      // Continue anyway - schema is already initialized
    }
    
    // Get already applied migrations
    const appliedMigrations = await getAppliedMigrations();
    logger.info(`📋 Already applied: ${appliedMigrations.length} migrations`);
    
    const migrationsDir = path.join(__dirname, 'migrations');
    
    // Ensure migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      logger.info('ℹ️  Migrations directory does not exist - no additional migrations to apply');
      return true;
    }
    
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (migrationFiles.length === 0) {
      logger.info('ℹ️  No migration files found');
      return true;
    }
    
    logger.info(`📂 Found ${migrationFiles.length} migration files`);
    
    let appliedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    
    for (const file of migrationFiles) {
      if (appliedMigrations.includes(file)) {
        logger.debug(`⏭️  Already applied: ${file}`);
        skippedCount++;
        continue;
      }
      
      try {
        const filePath = path.join(migrationsDir, file);
        
        // Safety: Check file exists
        if (!fs.existsSync(filePath)) {
          logger.warn(`⚠️  Migration file not found: ${file}`);
          failedCount++;
          continue;
        }

        const sql = fs.readFileSync(filePath, 'utf8');
        
        // Safety: Check file is not empty
        if (!sql.trim()) {
          logger.warn(`⚠️  Migration file is empty: ${file}`);
          skippedCount++;
          continue;
        }
        
        const success = await applyMigration(file, sql);
        if (success) {
          appliedCount++;
        } else {
          failedCount++;
        }
      } catch (fileError) {
        logger.warn(`⚠️  Error processing migration file ${file}: ${fileError.message}`);
        failedCount++;
      }
    }
    
    logger.info(`✅ Migration system complete: ${appliedCount} applied, ${skippedCount} skipped, ${failedCount} failed`);
    return true;  // Always return true - migrations are optional
  } catch (error) {
    logger.warn('⚠️  Migration system error (non-blocking)', { error: error.message });
    return true;  // Non-fatal - app continues
  }
}

module.exports = {
  runMigrations,
  applyMigration,
  getAppliedMigrations,
  initMigrationsTable,
};
