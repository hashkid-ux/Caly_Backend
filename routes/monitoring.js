/**
 * Monitoring Routes - APM, Circuit Breaker Status, and System Health
 * GET /api/monitoring/health - Full health report
 * GET /api/monitoring/metrics - Performance metrics
 * GET /api/monitoring/circuit-breakers - Circuit breaker status
 */

const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));
const authMiddleware = require(resolve('auth/authMiddleware'));
const { apm } = require(resolve('utils/apmMonitoring'));
const { manager: cbManager } = require(resolve('utils/circuitBreaker'));

/**
 * Full health report - includes APM, circuit breakers, system info
 * GET /api/monitoring/health
 */
router.get('/health', authMiddleware, async (req, res) => {
  try {
    const report = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      apm: apm.getReport(),
      circuitBreakers: cbManager.getAllMetrics(),
      slowestEndpoints: apm.getSlowestEndpoints(5),
      failingEndpoints: apm.getMostFailingEndpoints(5),
    };

    res.json(report);
  } catch (error) {
    logger.error('Health check error', { error: error.message });
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

/**
 * Performance metrics only
 * GET /api/monitoring/metrics
 */
router.get('/metrics', authMiddleware, async (req, res) => {
  try {
    const metrics = {
      endpoints: apm.getEndpointMetrics(),
      database: apm.getDatabaseMetrics(),
      externalApis: apm.getExternalApiMetrics(),
      system: apm.getLatestSystemMetrics(),
      slowest: apm.getSlowestEndpoints(10),
      failing: apm.getMostFailingEndpoints(10),
    };

    res.json(metrics);
  } catch (error) {
    logger.error('Metrics endpoint error', { error: error.message });
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

/**
 * Circuit breaker status
 * GET /api/monitoring/circuit-breakers
 */
router.get('/circuit-breakers', authMiddleware, async (req, res) => {
  try {
    const breakers = cbManager.getAllMetrics();

    // Check if any breaker is open
    const openBreakers = Object.entries(breakers)
      .filter(([, metrics]) => metrics.state === 'OPEN')
      .map(([name]) => name);

    res.json({
      status: openBreakers.length > 0 ? 'warning' : 'healthy',
      timestamp: new Date().toISOString(),
      openBreakers,
      breakers,
    });
  } catch (error) {
    logger.error('Circuit breaker status error', { error: error.message });
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

/**
 * System resources
 * GET /api/monitoring/system
 */
router.get('/system', authMiddleware, async (req, res) => {
  try {
    const systemMetrics = apm.getSystemMetricsHistory(60);

    res.json({
      current: apm.getLatestSystemMetrics(),
      history: systemMetrics,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
    });
  } catch (error) {
    logger.error('System info error', { error: error.message });
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

/**
 * Reset metrics (admin only) - useful for testing
 * POST /api/monitoring/reset
 */
router.post('/reset', authMiddleware, async (req, res) => {
  try {
    // Only allow in development or with specific header
    if (process.env.NODE_ENV === 'production' && req.headers['x-reset-metrics'] !== process.env.ADMIN_SECRET) {
      return res.status(403).json({
        error: 'Cannot reset metrics in production',
      });
    }

    apm.reset();
    logger.info('✅ Metrics reset');

    res.json({
      status: 'success',
      message: 'Metrics reset',
    });
  } catch (error) {
    logger.error('Metrics reset error', { error: error.message });
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

module.exports = router;
