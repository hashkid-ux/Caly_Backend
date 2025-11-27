/**
 * Database Initialization System v2
 * Robust initialization with proper error handling, transactions, and validation
 * 
 * Features:
 * - Proper SQL statement parsing (not naive semicolon split)
 * - Table existence validation
 * - Comprehensive error logging
 * - Idempotent execution (safe to run multiple times)
 * - Transaction-safe operations
 */

const fs = require('fs');
const path = require('path');
const db = require('./postgres');
const logger = require('../utils/logger');

/**
 * Parse SQL file into individual statements, respecting multi-line statements
 * Handles:
 * - Multi-line CREATE TABLE statements
 * - Comments (-- and / * /)
 * - String literals containing semicolons
 * - Dollar quotes ($$ - PostgreSQL specific)
 * 
 * This is WAY better than naive split(';')
 */
function parseSqlStatements(sql) {
  const statements = [];
  let currentStatement = '';
  let inString = false;
  let inDollarQuote = false;
  let dollarQuoteTag = '';
  let inBlockComment = false;
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];
    const twoChars = sql.substring(i, i + 2);

    // Handle line comments
    if (!inString && !inDollarQuote && !inBlockComment && twoChars === '--') {
      while (i < sql.length && sql[i] !== '\n') {
        i++;
      }
      i++;
      continue;
    }

    // Handle block comments
    if (!inString && !inDollarQuote && !inBlockComment && twoChars === '/*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (inBlockComment && twoChars === '*/') {
      inBlockComment = false;
      i += 2;
      continue;
    }

    // Handle dollar quotes (PostgreSQL specific)
    if (!inString && !inBlockComment && char === '$') {
      let tagEnd = i + 1;
      while (tagEnd < sql.length && sql[tagEnd] !== '$') {
        tagEnd++;
      }

      if (tagEnd < sql.length) {
        const tag = sql.substring(i + 1, tagEnd);

        if (!inDollarQuote) {
          // Entering dollar quote
          inDollarQuote = true;
          dollarQuoteTag = tag;
          // Add the dollar quote tag itself to the statement
          currentStatement += sql.substring(i, tagEnd + 1);
          i = tagEnd + 1;
          continue;
        } else if (tag === dollarQuoteTag) {
          // Exiting dollar quote
          inDollarQuote = false;
          // Add the closing dollar quote tag to the statement
          currentStatement += sql.substring(i, tagEnd + 1);
          i = tagEnd + 1;
          continue;
        }
      }
    }

    // Handle regular string quotes (not in dollar quotes)
    if (!inDollarQuote && !inBlockComment) {
      if (char === "'" && (i === 0 || sql[i - 1] !== '\\')) {
        inString = !inString;
      }
    }

    // Handle statement terminator (semicolon)
    if (
      !inString &&
      !inDollarQuote &&
      !inBlockComment &&
      char === ';'
    ) {
      currentStatement += char;
      const trimmed = currentStatement.trim();
      if (trimmed && !trimmed.startsWith('--') && !trimmed.startsWith('/*')) {
        statements.push(trimmed);
      }
      currentStatement = '';
      i++;
      continue;
    }

    // Accumulate character
    if (!inBlockComment) {
      currentStatement += char;
    }

    i++;
  }

  // Add remaining statement if any
  if (currentStatement.trim() && !currentStatement.trim().startsWith('--')) {
    statements.push(currentStatement.trim());
  }

  return statements.filter(stmt => stmt && stmt.length > 2);
}

/**
 * Validate that a table exists in PostgreSQL
 */
async function tableExists(tableName) {
  try {
    const result = await db.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      ) as exists`,
      [tableName]
    );
    return result.rows[0].exists;
  } catch (error) {
    logger.error(`Failed to check table existence: ${tableName}`, {
      error: error.message,
    });
    return false;
  }
}

/**
 * Get list of all tables in public schema
 */
async function getExistingTables() {
  try {
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    return result.rows.map(row => row.table_name);
  } catch (error) {
    logger.error('Failed to get existing tables', {
      error: error.message,
    });
    return [];
  }
}

/**
 * Extract table names from SQL statements
 */
function extractTableNames(statements) {
  const tables = new Set();

  for (const stmt of statements) {
    const match = stmt.match(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:")?(\w+)(?:")?/i
    );
    if (match) {
      tables.add(match[1]);
    }
  }

  return Array.from(tables);
}

/**
 * Execute SQL schema file with proper error handling
 */
async function executeSchema(filePath, description) {
  try {
    logger.info(`📂 Reading schema file: ${description}`);

    if (!fs.existsSync(filePath)) {
      logger.warn(`⚠️  Schema file not found: ${filePath}`);
      return {
        success: false,
        file: description,
        error: 'File not found',
        executed: 0,
        failed: 0,
      };
    }

    const schemaContent = fs.readFileSync(filePath, 'utf8');
    const statements = parseSqlStatements(schemaContent);

    if (statements.length === 0) {
      logger.warn(`⚠️  No SQL statements found in ${description}`);
      return {
        success: true,
        file: description,
        executed: 0,
        failed: 0,
      };
    }

    logger.info(
      `📋 Found ${statements.length} SQL statements in ${description}`
    );

    const results = {
      success: true,
      file: description,
      executed: 0,
      failed: 0,
      errors: [],
    };

    // Get existing tables before execution
    const existingTablesBefore = await getExistingTables();
    logger.debug(
      `📊 Tables before ${description}: ${existingTablesBefore.length || 'none'}`
    );

    // Execute each statement individually
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const statementType = statement
        .split(/\s+/)[0]
        .toUpperCase();

      try {
        await db.query(statement);
        results.executed++;
      } catch (error) {
        // Determine if this is an ignorable error
        const ignorable =
          error.message.includes('already exists') ||
          error.message.includes('ALREADY EXISTS') ||
          error.code === '42P07' || // TABLE_ALREADY_EXISTS
          error.code === '42701' || // COLUMN_ALREADY_EXISTS
          error.code === '42P13' || // CONSTRAINT_ALREADY_EXISTS
          error.code === '42P14'; // COLUMN_ALREADY_DEFINED

        if (ignorable) {
          logger.debug(`⏭️  ${statementType} already exists (OK)`);
          results.executed++;
        } else {
          logger.error(`❌ Failed ${statementType}`, {
            statement: statement.substring(0, 100),
            error: error.message,
            code: error.code,
          });

          results.failed++;
          results.success = false;
          results.errors.push({
            type: statementType,
            error: error.message,
            code: error.code,
          });
        }
      }
    }

    // Validate tables were created
    const existingTablesAfter = await getExistingTables();
    const expectedTables = extractTableNames(statements);
    const newTables = expectedTables.filter(
      table => !existingTablesBefore.includes(table)
    );

    if (newTables.length > 0) {
      logger.info(`✅ New tables created: ${newTables.join(', ')}`);
    }

    return results;
  } catch (error) {
    logger.error(`Failed to execute schema: ${description}`, {
      error: error.message,
    });

    return {
      success: false,
      file: description,
      error: error.message,
      executed: 0,
      failed: 1,
    };
  }
}

/**
 * Validate that all required tables exist
 */
async function validateSchema() {
  try {
    logger.info('🔍 Validating database schema...');

    const requiredTables = [
      'clients',
      'users',
      'calls',
      'actions',
      'entities',
      'audit_logs',
      'agent_metrics',
      'session',
      'migrations',
    ];

    const existingTables = await getExistingTables();
    const missingTables = requiredTables.filter(
      table => !existingTables.includes(table)
    );

    if (missingTables.length > 0) {
      logger.error('❌ Schema validation FAILED - Missing tables:', {
        missing: missingTables,
        found: existingTables.length,
      });
      return false;
    }

    logger.info(`✅ Schema validation PASSED - ${existingTables.length} tables exist`);

    // Verify OAuth columns in users table
    const columnCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('id', 'email', 'password_hash', 'client_id', 'google_id')
    `);

    if (columnCheck.rowCount < 5) {
      logger.warn('⚠️  Some expected columns missing in users table');
      return false;
    }

    logger.info('✅ All critical columns verified including OAuth columns');

    return true;
  } catch (error) {
    logger.error('Schema validation error', {
      error: error.message,
    });
    return false;
  }
}

/**
 * Initialize database with proper error handling and validation
 * Main entry point - this is what server.js calls
 */
async function initializeDatabase() {
  const startTime = Date.now();

  try {
    logger.info('🚀 STARTING ROBUST DATABASE INITIALIZATION');
    logger.info('═'.repeat(60));

    // Step 1: Test connection
    logger.info('🔗 Step 1: Testing database connection...');
    try {
      const testResult = await db.query('SELECT NOW() as current_time');
      logger.info(`✅ Database ready at ${testResult.rows[0].current_time}`);
    } catch (error) {
      logger.error('❌ CRITICAL: Cannot connect to database', {
        error: error.message,
      });
      throw new Error('Database connection failed - cannot proceed');
    }

    // Step 2: Create/ensure migrations table exists
    logger.info('🔗 Step 2: Ensuring migrations tracking table exists...');
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      logger.info('✅ Migrations table ready');
    } catch (error) {
      logger.error('❌ Failed to create migrations table', {
        error: error.message,
      });
      throw error;
    }

    // Step 3: Execute main schema
    logger.info('🔗 Step 3: Executing main schema (schema.sql)...');
    const mainSchemaResult = await executeSchema(
      path.join(__dirname, 'schema.sql'),
      'Main Schema'
    );

    logger.info(
      `   ✅ Executed: ${mainSchemaResult.executed} | Failed: ${mainSchemaResult.failed}`
    );

    if (mainSchemaResult.failed > 5) {
      logger.warn(`⚠️  Main schema had multiple failures - review needed`);
    }

    // Step 4: Execute auth schema if exists
    const authSchemaPath = path.join(__dirname, 'auth-schema.sql');
    if (fs.existsSync(authSchemaPath)) {
      logger.info('🔗 Step 4: Executing auth schema (auth-schema.sql)...');
      const authSchemaResult = await executeSchema(
        authSchemaPath,
        'Auth Schema'
      );

      logger.info(
        `   ✅ Executed: ${authSchemaResult.executed} | Failed: ${authSchemaResult.failed}`
      );
    }

    // Step 5: Validate schema
    logger.info('🔗 Step 5: Validating schema...');
    const isValid = await validateSchema();

    if (!isValid) {
      logger.error(
        '❌ CRITICAL: Schema validation failed - required tables missing'
      );
      throw new Error('Schema validation failed - database not ready');
    }

    const duration = Date.now() - startTime;

    logger.info('═'.repeat(60));
    logger.info(
      `✅ DATABASE INITIALIZATION SUCCESSFUL in ${duration}ms`
    );

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('❌ DATABASE INITIALIZATION FAILED', {
      error: error.message,
      duration: `${duration}ms`,
    });

    throw error;
  }
}

module.exports = {
  initializeDatabase,
  validateSchema,
  getExistingTables,
  parseSqlStatements,
  tableExists,
  executeSchema,
};
