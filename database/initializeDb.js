/**
 * Database Initialization Script
 * 
 * Run this script to:
 * - Check database connection
 * - Run all pending migrations
 * - Seed sample data
 * - Verify all tables exist
 */

const { runMigrations, checkMigrationsStatus, seedSampleData } = require('./teamsMigration');
const db = require('../db');

async function initializeDatabase() {
  try {
    console.log('╔════════════════════════════════════╗');
    console.log('║  Database Initialization Started   ║');
    console.log('╚════════════════════════════════════╝\n');

    // Step 1: Check connection
    console.log('1️⃣  Checking database connection...');
    try {
      await db.query('SELECT 1');
      console.log('✅ Database connection successful\n');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      process.exit(1);
    }

    // Step 2: Check existing migrations
    console.log('2️⃣  Checking existing migrations...');
    const migrationsExist = await checkMigrationsStatus();
    console.log('');

    // Step 3: Run migrations if needed
    if (!migrationsExist) {
      console.log('3️⃣  Running migrations...');
      await runMigrations();
      console.log('');
    } else {
      console.log('3️⃣  Migrations already applied, skipping...\n');
    }

    // Step 4: Seed sample data (optional)
    console.log('4️⃣  Checking for sample data...');
    const existingTeams = await db.query('SELECT COUNT(*) as count FROM teams');
    if (existingTeams[0].count === 0) {
      console.log('No teams found, seeding sample data...');
      await seedSampleData();
    } else {
      console.log(`✅ Teams already exist (${existingTeams[0].count} teams found)\n`);
    }

    // Step 5: Verify everything
    console.log('5️⃣  Verifying database schema...');
    const tableStatuses = await verifySchema();
    console.log('');

    console.log('╔════════════════════════════════════╗');
    console.log('║  ✨ Database Ready for Use!       ║');
    console.log('╚════════════════════════════════════╝\n');

    console.log('📊 Database Summary:');
    console.log(tableStatuses.map(s => `  ${s.status} ${s.table}`).join('\n'));
    console.log('\n✅ All systems ready!');

    return true;
  } catch (error) {
    console.error('\n❌ Initialization failed:', error);
    process.exit(1);
  }
}

/**
 * Verify database schema
 */
async function verifySchema() {
  const tables = ['teams', 'team_members', 'team_agent_assignments', 'team_performance'];
  const statuses = [];

  for (const table of tables) {
    try {
      const columns = await db.query(`SHOW COLUMNS FROM ${table}`);
      statuses.push({
        table: `${table} (${columns.length} columns)`,
        status: '✅'
      });
    } catch (error) {
      statuses.push({
        table: `${table}`,
        status: '❌'
      });
    }
  }

  return statuses;
}

/**
 * Export for use in server.js
 */
module.exports = {
  initializeDatabase
};

// Run if called directly
if (require.main === module) {
  initializeDatabase().catch(console.error);
}
