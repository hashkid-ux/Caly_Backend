// Backend/scripts/init-db.js - Database initialization for Railway
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || ''),
  success: (msg) => console.log(`[SUCCESS] ✓ ${msg}`)
};

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initializeDatabase() {
  let client;
  
  try {
    logger.info('🚀 Starting database initialization...');
    
    // Test connection
    client = await pool.connect();
    logger.success('Database connection established');
    
    // Read schema file
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    logger.info('📄 Executing schema...');
    
    // Split by semicolons and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      if (statement.includes('CREATE TABLE') || statement.includes('CREATE EXTENSION')) {
        // Check if table/extension exists
        const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/)?.[1];
        if (tableName) {
          const check = await client.query(
            "SELECT to_regclass($1) as exists",
            ['public.' + tableName]
          );
          
          if (check.rows[0].exists) {
            logger.info(`⏭️  Table ${tableName} already exists, skipping`);
            continue;
          }
        }
      }
      
      try {
        await client.query(statement);
        logger.success(`Executed: ${statement.substring(0, 50)}...`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          logger.info(`⏭️  Already exists: ${statement.substring(0, 50)}...`);
        } else {
          logger.error(`Failed statement: ${statement.substring(0, 100)}`, err.message);
        }
      }
    }
    
    // Insert test client if none exists (development only)
    if (process.env.NODE_ENV !== 'production') {
      const clientCheck = await client.query('SELECT COUNT(*) FROM clients');
      
      if (parseInt(clientCheck.rows[0].count) === 0) {
        logger.info('📝 Creating test client (development mode)...');
        
        await client.query(`
          INSERT INTO clients (
            name, email, phone,
            shopify_store_url, shopify_api_key,
            exotel_number,
            return_window_days, refund_auto_threshold,
            active
          ) VALUES (
            'Demo Store',
            'demo@caly.ai',
            '+911234567890',
            'demo-store.myshopify.com',
            'demo_api_key',
            '+918012345678',
            14,
            2000,
            true
          )
        `);
        
        logger.success('✅ Test client created (dev mode only)');
      } else {
        logger.info(`✓ Found ${clientCheck.rows[0].count} existing clients`);
      }
    } else {
      logger.info('⏭️  Skipping test client creation (production mode)');
    }
    
    // Verify tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    logger.success(`Database ready with ${tables.rows.length} tables:`);
    tables.rows.forEach(t => logger.info(`  • ${t.table_name}`));
    
    logger.success('🎉 Database initialization complete!');
    
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      logger.success('✅ All done!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };