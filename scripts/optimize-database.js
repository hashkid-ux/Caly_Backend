/**
 * Database Performance Optimizer
 * Analyzes and optimizes PostgreSQL queries
 * Run: node scripts/optimize-database.js
 */

const db = require('../db/postgres');
const logger = require('../utils/logger');

async function createOptimizedIndexes() {
  console.log('\n🔧 Creating Performance Indexes\n');

  try {
    const indexes = [
      { name: 'idx_calls_client_created', query: 'CREATE INDEX IF NOT EXISTS idx_calls_client_created ON calls(client_id, created_at DESC);' },
      { name: 'idx_calls_resolved_client', query: 'CREATE INDEX IF NOT EXISTS idx_calls_resolved_client ON calls(client_id, resolved, created_at DESC);' },
      { name: 'idx_session_expire', query: 'CREATE INDEX IF NOT EXISTS idx_session_expire ON "session"(expire);' },
      { name: 'idx_entities_call', query: 'CREATE INDEX IF NOT EXISTS idx_entities_call ON entities(call_id);' }
    ];

    for (const index of indexes) {
      try {
        await db.query(index.query);
        console.log(`  ✅ ${index.name}`);
      } catch (error) {
        console.log(`  ⚠️  ${index.name}: ${error.message}`);
      }
    }

    // Analyze tables
    console.log('\n📊 Analyzing tables for query planner...\n');
    const tables = ['calls', 'actions', 'entities', 'session', 'users', 'clients'];
    for (const table of tables) {
      try {
        await db.query(`ANALYZE ${table};`);
        console.log(`  ✅ Analyzed: ${table}`);
      } catch (error) {
        console.log(`  ⚠️  ${table}: ${error.message}`);
      }
    }

    console.log('\n✅ Index creation and analysis complete!\n');
  } catch (error) {
    logger.error('Error creating indexes:', error);
  }
}

async function analyzeIndexes() {
  console.log('\n📊 Database Index Analysis\n');

  try {
    // Get index statistics
    const indexStats = await db.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC;
    `);

    console.log('Index Usage Statistics:');
    console.log('─────────────────────────────────────────────────────');
    indexStats.rows.forEach(idx => {
      console.log(`  ${idx.indexname}`);
      console.log(`    Table: ${idx.tablename}`);
      console.log(`    Scans: ${idx.scans}, Size: ${idx.size}`);
      console.log(`    Tuples: Read=${idx.tuples_read}, Fetched=${idx.tuples_fetched}`);
    });

    // Find missing indexes
    const missingIndexes = await db.query(`
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats
      WHERE schemaname = 'public'
      AND n_distinct > 100
      AND abs(correlation) < 0.1
      ORDER BY n_distinct DESC;
    `);

    if (missingIndexes.rows.length > 0) {
      console.log('\n⚠️  Columns that might benefit from indexes:');
      console.log('─────────────────────────────────────────────────────');
      missingIndexes.rows.forEach(col => {
        console.log(`  ${col.tablename}.${col.attname}`);
        console.log(`    Distinct values: ${col.n_distinct}`);
      });
    }

  } catch (error) {
    logger.error('Error analyzing indexes:', error);
  }
}

async function analyzeTableSizes() {
  console.log('\n📦 Table Size Analysis\n');

  try {
    const sizes = await db.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
        pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size,
        (SELECT count(*) FROM information_schema.tables WHERE table_schema = schemaname AND table_name = tablename) AS exists
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
    `);

    console.log('Table Sizes:');
    console.log('─────────────────────────────────────────────────────');
    sizes.rows.forEach(tbl => {
      console.log(`  ${tbl.tablename}`);
      console.log(`    Table: ${tbl.table_size}, Indexes: ${tbl.indexes_size}, Total: ${tbl.total_size}`);
    });

  } catch (error) {
    logger.error('Error analyzing table sizes:', error);
  }
}

async function analyzeSlowQueries() {
  console.log('\n🐌 Slow Query Analysis\n');

  try {
    // Enable pg_stat_statements extension first
    await db.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');

    const slowQueries = await db.query(`
      SELECT 
        query,
        calls,
        mean_exec_time,
        max_exec_time,
        total_exec_time
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat%'
      AND mean_exec_time > 100
      ORDER BY mean_exec_time DESC
      LIMIT 10;
    `);

    if (slowQueries.rows.length > 0) {
      console.log('Slowest Queries (>100ms avg):');
      console.log('─────────────────────────────────────────────────────');
      slowQueries.rows.forEach((q, i) => {
        console.log(`\n  ${i + 1}. Avg: ${q.mean_exec_time.toFixed(2)}ms, Max: ${q.max_exec_time.toFixed(2)}ms`);
        console.log(`     Calls: ${q.calls}, Total: ${q.total_exec_time.toFixed(0)}ms`);
        console.log(`     Query: ${q.query.substring(0, 80)}...`);
      });
    } else {
      console.log('✓ No slow queries detected');
    }

  } catch (error) {
    if (error.message.includes('pg_stat_statements')) {
      console.log('Note: Install pg_stat_statements extension for slow query analysis');
    } else {
      logger.error('Error analyzing slow queries:', error);
    }
  }
}

async function optimizationRecommendations() {
  console.log('\n💡 Optimization Recommendations\n');
  console.log('─────────────────────────────────────────────────────');

  try {
    // Check autovacuum settings
    const autovacuum = await db.query(`
      SELECT name, setting FROM pg_settings 
      WHERE name LIKE '%autovacuum%' AND setting = 'off'
    `);

    if (autovacuum.rows.length > 0) {
      console.log('  ⚠️  Autovacuum is disabled - enable for production');
    }

    // Check max connections
    const maxConns = await db.query(`
      SELECT setting FROM pg_settings WHERE name = 'max_connections'
    `);
    console.log(`  ✓ Max connections: ${maxConns.rows[0]?.setting}`);

    // Check cache settings
    const cache = await db.query(`
      SELECT setting FROM pg_settings WHERE name = 'shared_buffers'
    `);
    console.log(`  ✓ Shared buffers: ${cache.rows[0]?.setting}`);

    // Recommend indexes based on query patterns
    console.log('\n  Recommended Indexes:');
    console.log('    • calls(client_id, created_at DESC) - for list queries');
    console.log('    • audit_logs(created_at DESC) - for retention queries');
    console.log('    • actions(call_id, created_at DESC) - for detail queries');

    // Maintenance recommendations
    console.log('\n  Maintenance Tasks:');
    console.log('    • ANALYZE (weekly) - update query planner statistics');
    console.log('    • VACUUM (daily) - recover disk space');
    console.log('    • REINDEX (monthly) - rebuild indexes');

  } catch (error) {
    logger.error('Error getting recommendations:', error);
  }
}

async function runOptimizations() {
  console.log('\n🚀 Running Database Optimization\n');
  console.log('═════════════════════════════════════════════════════════');

  try {
    // First create indexes (CRITICAL)
    await createOptimizedIndexes();
    
    // Then analyze
    await analyzeIndexes();
    await analyzeTableSizes();
    await analyzeSlowQueries();
    await optimizationRecommendations();

    console.log('\n═════════════════════════════════════════════════════════');
    console.log('✓ Database optimization complete\n');

  } catch (error) {
    console.error('Fatal error during optimization:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  runOptimizations();
}

module.exports = {
  createOptimizedIndexes,
  analyzeIndexes,
  analyzeTableSizes,
  analyzeSlowQueries,
  optimizationRecommendations,
  runOptimizations,
};
