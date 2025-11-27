/**
 * Database Connection Pooling Configuration
 * Optimizes database connection management for better performance and resource usage
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// 🔒 SECURITY FIX 4: Validate DATABASE_URL exists at module load time
if (!process.env.DATABASE_URL) {
  throw new Error(
    '❌ FATAL: DATABASE_URL environment variable must be set.\n' +
    'Example: postgresql://user:password@host:port/database'
  );
}

/**
 * Create optimized connection pool
 */
const createConnectionPool = (config = {}) => {
  const {
    connectionString = process.env.DATABASE_URL,
    max = parseInt(process.env.DB_POOL_MAX || '20'), // Max connections
    min = parseInt(process.env.DB_POOL_MIN || '5'), // Min connections
    idleTimeoutMillis = parseInt(process.env.DB_IDLE_TIMEOUT || '30000'), // 30 seconds
    connectionTimeoutMillis = parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'), // 10 seconds
    statementTimeoutMillis = parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'), // 30 seconds
    maxUses = parseInt(process.env.DB_MAX_USES || '10000'), // Close connection after N uses
  } = config;

  // Validate configuration
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  if (min > max) {
    throw new Error('DB_POOL_MIN cannot be greater than DB_POOL_MAX');
  }

  const pool = new Pool({
    connectionString,
    max,
    min,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    statement_timeout: statementTimeoutMillis,
    application_name: 'caly-voice-agent',
  });

  // Track connection usage
  const connectionUsage = new Map();

  /**
   * Wrap query to track connection usage
   */
  const originalQuery = pool.query.bind(pool);
  pool.query = function (querySpec, values, callback) {
    const isCallback = typeof callback === 'function';
    const query = typeof querySpec === 'string' ? querySpec : querySpec.text;

    // Log slow queries (>500ms)
    const startTime = Date.now();

    const handleResult = (err, result) => {
      const duration = Date.now() - startTime;

      if (duration > 500) {
        logger.warn('Slow database query', {
          query: query.substring(0, 100), // First 100 chars
          duration: `${duration}ms`,
          rows: result?.rowCount || 0,
        });
      }

      if (isCallback) {
        callback(err, result);
      }
    };

    if (isCallback) {
      return originalQuery(querySpec, values, handleResult);
    } else {
      return originalQuery(querySpec, values).then(
        (result) => {
          handleResult(null, result);
          return result;
        },
        (error) => {
          handleResult(error);
          throw error;
        }
      );
    }
  };

  // Log pool events
  pool.on('connect', () => {
    logger.debug('Database connection established');
  });

  pool.on('error', (error) => {
    logger.error('Unexpected error on idle client', {
      error: error.message,
    });
  });

  pool.on('remove', () => {
    logger.debug('Database connection removed from pool');
  });

  /**
   * Get pool statistics
   */
  pool.getStats = () => {
    return {
      totalConnections: pool.totalCount,
      activeConnections: pool.activeCount,
      availableConnections: pool.availableObjectCount,
      waitingRequests: pool.waitingCount,
      config: {
        max,
        min,
        idleTimeoutMillis,
        connectionTimeoutMillis,
      },
    };
  };

  /**
   * Health check
   */
  pool.healthCheck = async () => {
    try {
      const result = await pool.query('SELECT 1 as health');
      return {
        healthy: true,
        message: 'Connection pool is healthy',
        stats: pool.getStats(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Connection pool health check failed: ${error.message}`,
        stats: pool.getStats(),
      };
    }
  };

  /**
   * Drain pool (graceful shutdown)
   */
  pool.drain = async () => {
    logger.info('Draining database connection pool...');
    await pool.end();
    logger.info('Database connection pool closed');
  };

  return pool;
};

/**
 * Connection pool statistics middleware
 */
const poolStatsMiddleware = (pool) => {
  return (req, res, next) => {
    // Expose pool stats on request object
    req.dbStats = pool.getStats();
    next();
  };
};

/**
 * Connection pool health check endpoint
 */
const createHealthCheckRoute = (pool, router = null) => {
  const handler = async (req, res) => {
    try {
      const health = await pool.healthCheck();
      const statusCode = health.healthy ? 200 : 503;

      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        healthy: false,
        message: error.message,
      });
    }
  };

  if (router) {
    router.get('/db/health', handler);
    return router;
  }

  return handler;
};

/**
 * Connection pool monitoring
 * Logs pool statistics periodically
 */
const createPoolMonitoring = (pool, intervalMs = 60000) => {
  const interval = setInterval(() => {
    const stats = pool.getStats();

    // Log warning if pool is stressed
    if (stats.waitingRequests > 0) {
      logger.warn('Database connection pool stressed', {
        waitingRequests: stats.waitingRequests,
        activeConnections: stats.activeConnections,
        availableConnections: stats.availableConnections,
      });
    }

    // Log info periodically
    logger.debug('Database connection pool stats', stats);
  }, intervalMs);

  return {
    stop: () => clearInterval(interval),
  };
};

/**
 * Query result caching (optional optimization)
 */
class QueryCache {
  constructor(ttlSeconds = 60) {
    this.cache = new Map();
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Get from cache
   */
  get(key) {
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() - item.timestamp > this.ttlSeconds * 1000) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Set in cache
   */
  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size() {
    return this.cache.size;
  }
}

/**
 * Batch query optimization
 * Combines multiple queries into a single transaction
 */
const batchQuery = async (pool, queries) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const results = [];

    for (const { text, values } of queries) {
      const result = await client.query(text, values);
      results.push(result);
    }

    await client.query('COMMIT');

    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};



// Create default pool instance for session storage and general use
const pool = createConnectionPool();

module.exports = {
  // Pool instance
  pool,

  // Pool creation
  createConnectionPool,

  // Middleware
  poolStatsMiddleware,
  createHealthCheckRoute,

  // Monitoring
  createPoolMonitoring,

  // Optimization
  QueryCache,
  batchQuery,
};
