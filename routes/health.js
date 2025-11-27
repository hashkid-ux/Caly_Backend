/**
 * Health Check Routes
 * Provides system health status for monitoring and load balancers
 * Includes detailed dependency checks (database, external services, etc.)
 */

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const { encrypt, decrypt } = require('../utils/encryption');

/**
 * Health check status enum
 */
const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
};

/**
 * Response time tracking
 */
const perfMetrics = {
  startTime: Date.now(),
  checks: {},
};

/**
 * Check database connectivity
 */
const checkDatabase = async () => {
  const startTime = Date.now();
  try {
    const result = await db.query('SELECT 1 as health');
    return {
      status: HealthStatus.HEALTHY,
      message: 'Database connection successful',
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: HealthStatus.UNHEALTHY,
      message: `Database connection failed: ${error.message}`,
      responseTime: Date.now() - startTime,
    };
  }
};

/**
 * Check encryption service
 */
const checkEncryption = async () => {
  const startTime = Date.now();
  try {
    const testData = 'encryption-test';
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);

    if (decrypted !== testData) {
      throw new Error('Encryption/decryption mismatch');
    }

    return {
      status: HealthStatus.HEALTHY,
      message: 'Encryption service working correctly',
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: HealthStatus.UNHEALTHY,
      message: `Encryption service failed: ${error.message}`,
      responseTime: Date.now() - startTime,
    };
  }
};

/**
 * Check environment variables
 */
const checkEnvironment = async () => {
  const startTime = Date.now();
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'OPENAI_API_KEY',
    'ENCRYPTION_KEY',
  ];

  const missing = requiredVars.filter((v) => !process.env[v]);

  return {
    status: missing.length === 0 ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
    message: missing.length === 0 ? 'All required environment variables set' : `Missing: ${missing.join(', ')}`,
    responseTime: Date.now() - startTime,
    missingVariables: missing,
  };
};

/**
 * Check memory usage
 */
const checkMemory = async () => {
  const startTime = Date.now();
  const memUsage = process.memoryUsage();
  const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

  return {
    status: heapUsedPercent < 90 ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
    message: heapUsedPercent < 90 ? 'Memory usage normal' : 'High memory usage',
    responseTime: Date.now() - startTime,
    memoryUsage: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsedPercent: heapUsedPercent.toFixed(2),
      externalMB: Math.round(memUsage.external / 1024 / 1024),
    },
  };
};

/**
 * Check uptime
 */
const checkUptime = async () => {
  const uptime = Date.now() - perfMetrics.startTime;
  const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
  const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

  return {
    status: HealthStatus.HEALTHY,
    message: 'Server is running',
    responseTime: 0,
    uptime: {
      days,
      hours,
      minutes,
      milliseconds: uptime,
    },
  };
};

/**
 * Determine overall health status
 */
const determineOverallStatus = (checks) => {
  const statuses = Object.values(checks).map((c) => c.status);

  if (statuses.includes(HealthStatus.UNHEALTHY)) {
    return HealthStatus.UNHEALTHY;
  }
  if (statuses.includes(HealthStatus.DEGRADED)) {
    return HealthStatus.DEGRADED;
  }
  return HealthStatus.HEALTHY;
};

/**
 * GET /health/live
 * Liveness probe - is the application running?
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 * Readiness probe - is the application ready to serve traffic?
 */
router.get('/ready', async (req, res) => {
  try {
    const checks = {
      database: await checkDatabase(),
      environment: await checkEnvironment(),
    };

    const overallStatus = determineOverallStatus(checks);

    const statusCode = overallStatus === HealthStatus.HEALTHY ? 200 : 503;

    res.status(statusCode).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
    });
  } catch (error) {
    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/detailed
 * Comprehensive health check - all systems
 */
router.get('/detailed', async (req, res) => {
  try {
    const checks = {
      database: await checkDatabase(),
      encryption: await checkEncryption(),
      environment: await checkEnvironment(),
      memory: await checkMemory(),
      uptime: await checkUptime(),
    };

    const overallStatus = determineOverallStatus(checks);
    const totalResponseTime = Object.values(checks).reduce((sum, c) => sum + c.responseTime, 0);

    const statusCode = overallStatus === HealthStatus.HEALTHY ? 200 : 503;

    res.status(statusCode).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      nodeVersion: process.version,
      totalResponseTime,
      checks,
    });
  } catch (error) {
    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/metrics
 * Performance metrics and statistics
 */
router.get('/metrics', async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const uptime = Date.now() - perfMetrics.startTime;

    // Get database stats
    let dbStats = {};
    try {
      const result = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM calls) as total_calls,
          (SELECT COUNT(*) FROM clients) as total_clients,
          (SELECT COUNT(*) FROM call_charges) as total_charges,
          (SELECT COUNT(*) FROM audit_logs) as total_audit_logs
      `);
      dbStats = result.rows[0];
    } catch (error) {
      // Ignore DB stats errors
    }

    res.json({
      timestamp: new Date().toISOString(),
      uptime: {
        milliseconds: uptime,
        seconds: Math.floor(uptime / 1000),
        minutes: Math.floor(uptime / 60000),
        hours: Math.floor(uptime / 3600000),
      },
      memory: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
        externalMB: Math.round(memUsage.external / 1024 / 1024),
        arrayBuffersMB: Math.round(memUsage.arrayBuffers / 1024 / 1024),
      },
      database: dbStats,
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
