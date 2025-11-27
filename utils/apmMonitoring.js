/**
 * APM (Application Performance Monitoring) Integration
 * 
 * Features:
 * - Request latency tracking
 * - Database query performance
 * - External API call metrics
 * - Error rate monitoring
 * - Memory and CPU usage tracking
 * - Endpoint-specific metrics
 * - Performance alerts
 */

const logger = require('./logger');
const os = require('os');

class PerformanceMetrics {
  constructor() {
    this.endpointMetrics = new Map();
    this.databaseMetrics = new Map();
    this.externalApiMetrics = new Map();
    this.systemMetrics = [];
    this.startTime = Date.now();
    this.maxHistorySize = 1000;

    this.startSystemMonitoring();
  }

  /**
   * Start system-level monitoring
   */
  startSystemMonitoring() {
    setInterval(() => {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const systemLoad = os.loadavg();

      this.systemMetrics.push({
        timestamp: new Date().toISOString(),
        uptime,
        memory: {
          heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
          heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
          external: (memoryUsage.external / 1024 / 1024).toFixed(2) + ' MB',
          rss: (memoryUsage.rss / 1024 / 1024).toFixed(2) + ' MB',
        },
        cpu: {
          user: (cpuUsage.user / 1000).toFixed(2) + ' ms',
          system: (cpuUsage.system / 1000).toFixed(2) + ' ms',
        },
        systemLoad: {
          '1m': systemLoad[0].toFixed(2),
          '5m': systemLoad[1].toFixed(2),
          '15m': systemLoad[2].toFixed(2),
        },
      });

      // Keep only last N entries
      if (this.systemMetrics.length > this.maxHistorySize) {
        this.systemMetrics.shift();
      }

      // Check for memory issues
      const heapPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      if (heapPercent > 90) {
        logger.warn('⚠️  High memory usage detected', {
          heapPercent: heapPercent.toFixed(2) + '%',
          heapUsed: memoryUsage.heapUsed / 1024 / 1024,
          heapTotal: memoryUsage.heapTotal / 1024 / 1024,
        });
      }
    }, 60000); // Every minute
  }

  /**
   * Track request latency
   */
  trackRequestLatency(method, path, statusCode, duration) {
    const key = `${method} ${path}`;

    if (!this.endpointMetrics.has(key)) {
      this.endpointMetrics.set(key, {
        method,
        path,
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        errorCount: 0,
        successCount: 0,
        durationHistory: [],
      });
    }

    const metrics = this.endpointMetrics.get(key);
    metrics.count++;
    metrics.totalDuration += duration;
    metrics.minDuration = Math.min(metrics.minDuration, duration);
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    metrics.durationHistory.push(duration);

    if (statusCode >= 400) {
      metrics.errorCount++;
    } else {
      metrics.successCount++;
    }

    // Keep history limited
    if (metrics.durationHistory.length > 100) {
      metrics.durationHistory.shift();
    }

    // Alert on slow endpoints (>5s)
    if (duration > 5000) {
      logger.warn('⚠️  Slow endpoint detected', {
        endpoint: key,
        duration: duration + 'ms',
        statusCode,
      });
    }
  }

  /**
   * Track database query performance
   */
  trackDatabaseQuery(query, duration, success = true, error = null) {
    // Normalize query - use first 100 chars as key
    const queryKey = query.substring(0, 100).replace(/\s+/g, ' ');

    if (!this.databaseMetrics.has(queryKey)) {
      this.databaseMetrics.set(queryKey, {
        query: queryKey,
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        errors: 0,
        successes: 0,
      });
    }

    const metrics = this.databaseMetrics.get(queryKey);
    metrics.count++;
    metrics.totalDuration += duration;
    metrics.minDuration = Math.min(metrics.minDuration, duration);
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);

    if (success) {
      metrics.successes++;
    } else {
      metrics.errors++;
      if (error) {
        logger.warn('⚠️  Database query error', { query: queryKey, error });
      }
    }

    // Alert on slow queries (>3s)
    if (duration > 3000) {
      logger.warn('⚠️  Slow database query detected', {
        query: queryKey,
        duration: duration + 'ms',
      });
    }
  }

  /**
   * Track external API call performance
   */
  trackExternalApiCall(serviceName, endpoint, duration, statusCode, success = true) {
    const key = `${serviceName}:${endpoint}`;

    if (!this.externalApiMetrics.has(key)) {
      this.externalApiMetrics.set(key, {
        service: serviceName,
        endpoint,
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        successCount: 0,
        failureCount: 0,
        avgResponseTime: 0,
      });
    }

    const metrics = this.externalApiMetrics.get(key);
    metrics.count++;
    metrics.totalDuration += duration;
    metrics.minDuration = Math.min(metrics.minDuration, duration);
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    metrics.avgResponseTime = metrics.totalDuration / metrics.count;

    if (success && statusCode < 400) {
      metrics.successCount++;
    } else {
      metrics.failureCount++;
    }

    // Alert on slow external calls (>10s)
    if (duration > 10000) {
      logger.warn('⚠️  Slow external API call detected', {
        service: serviceName,
        endpoint,
        duration: duration + 'ms',
        statusCode,
      });
    }
  }

  /**
   * Get endpoint metrics summary
   */
  getEndpointMetrics() {
    const metrics = {};
    this.endpointMetrics.forEach((data, key) => {
      metrics[key] = {
        ...data,
        avgDuration: (data.totalDuration / data.count).toFixed(2) + 'ms',
        errorRate: ((data.errorCount / data.count) * 100).toFixed(2) + '%',
      };
    });
    return metrics;
  }

  /**
   * Get database metrics summary
   */
  getDatabaseMetrics() {
    const metrics = {};
    this.databaseMetrics.forEach((data, key) => {
      metrics[key] = {
        ...data,
        avgDuration: (data.totalDuration / data.count).toFixed(2) + 'ms',
        errorRate: ((data.errors / data.count) * 100).toFixed(2) + '%',
      };
    });
    return metrics;
  }

  /**
   * Get external API metrics summary
   */
  getExternalApiMetrics() {
    const metrics = {};
    this.externalApiMetrics.forEach((data, key) => {
      metrics[key] = {
        ...data,
        successRate: ((data.successCount / data.count) * 100).toFixed(2) + '%',
      };
    });
    return metrics;
  }

  /**
   * Get latest system metrics
   */
  getLatestSystemMetrics() {
    if (this.systemMetrics.length === 0) {
      return null;
    }
    return this.systemMetrics[this.systemMetrics.length - 1];
  }

  /**
   * Get system metrics history
   */
  getSystemMetricsHistory(limit = 60) {
    return this.systemMetrics.slice(-limit);
  }

  /**
   * Get comprehensive APM report
   */
  getReport() {
    return {
      timestamp: new Date().toISOString(),
      uptime: ((Date.now() - this.startTime) / 1000).toFixed(2) + 's',
      endpoints: {
        total: this.endpointMetrics.size,
        metrics: this.getEndpointMetrics(),
      },
      database: {
        total: this.databaseMetrics.size,
        metrics: this.getDatabaseMetrics(),
      },
      externalApis: {
        total: this.externalApiMetrics.size,
        metrics: this.getExternalApiMetrics(),
      },
      system: {
        current: this.getLatestSystemMetrics(),
        history: this.getSystemMetricsHistory(10),
      },
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    logger.info('🔄 Resetting APM metrics');
    this.endpointMetrics.clear();
    this.databaseMetrics.clear();
    this.externalApiMetrics.clear();
    this.systemMetrics = [];
    this.startTime = Date.now();
  }

  /**
   * Get slowest endpoints
   */
  getSlowestEndpoints(limit = 10) {
    const endpoints = Array.from(this.endpointMetrics.values())
      .sort((a, b) => {
        const avgA = a.totalDuration / a.count;
        const avgB = b.totalDuration / b.count;
        return avgB - avgA;
      })
      .slice(0, limit);

    return endpoints.map(ep => ({
      endpoint: `${ep.method} ${ep.path}`,
      avgDuration: (ep.totalDuration / ep.count).toFixed(2) + 'ms',
      maxDuration: ep.maxDuration + 'ms',
      count: ep.count,
      errorRate: ((ep.errorCount / ep.count) * 100).toFixed(2) + '%',
    }));
  }

  /**
   * Get most failing endpoints
   */
  getMostFailingEndpoints(limit = 10) {
    const endpoints = Array.from(this.endpointMetrics.values())
      .filter(ep => ep.errorCount > 0)
      .sort((a, b) => {
        const rateA = a.errorCount / a.count;
        const rateB = b.errorCount / b.count;
        return rateB - rateA;
      })
      .slice(0, limit);

    return endpoints.map(ep => ({
      endpoint: `${ep.method} ${ep.path}`,
      errorCount: ep.errorCount,
      totalCount: ep.count,
      errorRate: ((ep.errorCount / ep.count) * 100).toFixed(2) + '%',
    }));
  }
}

// Global APM instance
const apm = new PerformanceMetrics();

/**
 * Express middleware for automatic request tracking
 */
function createApmMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();

    // Wrap res.end to capture when response is sent
    const originalEnd = res.end;
    res.end = function(...args) {
      const duration = Date.now() - startTime;
      apm.trackRequestLatency(req.method, req.path, res.statusCode, duration);

      // Log slow requests
      if (duration > 5000) {
        logger.warn('⚠️  Slow request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: duration + 'ms',
        });
      }

      return originalEnd.apply(res, args);
    };

    next();
  };
}

module.exports = {
  PerformanceMetrics,
  apm,
  createApmMiddleware,
};
