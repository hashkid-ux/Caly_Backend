/**
 * Enhanced Request Logging Service
 * Logs detailed request/response information for debugging and monitoring
 * Tracks performance, errors, and suspicious patterns
 */

const logger = require('../utils/logger');

/**
 * Request logger middleware
 * Logs all request details including response time and size
 */
const requestLogger = (req, res, next) => {
  // Skip logging for health checks and static files
  if (
    req.path.includes('/health') ||
    req.path.includes('/static') ||
    req.path.includes('/favicon')
  ) {
    return next();
  }

  // Store request start time
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  // Store original response methods
  const originalSend = res.send;
  const originalJson = res.json;

  // Track response body size
  let responseSize = 0;

  // Intercept res.send()
  res.send = function (data) {
    responseSize = data ? Buffer.byteLength(data) : 0;
    return originalSend.call(this, data);
  };

  // Intercept res.json()
  res.json = function (data) {
    responseSize = JSON.stringify(data).length;
    return originalJson.call(this, data);
  };

  // Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage().heapUsed;
    const memoryDelta = Math.round((endMemory - startMemory) / 1024); // KB

    // Request details
    const requestLog = {
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      query: req.query,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: `${(responseSize / 1024).toFixed(2)}KB`,
      memoryDelta: `${memoryDelta}KB`,
      clientId: req.clientId || 'anonymous',
      userId: req.userId || null,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
    };

    // Determine log level based on status code
    if (res.statusCode >= 500) {
      logger.error('Server Error', requestLog);
    } else if (res.statusCode >= 400) {
      logger.warn('Client Error', requestLog);
    } else if (duration > 1000) {
      logger.warn('Slow Request', requestLog);
    } else {
      logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, {
        requestId: req.requestId,
        duration,
        responseSize,
      });
    }
  });

  next();
};

/**
 * Request body logger
 * Logs request body details (sensitive data sanitized)
 */
const requestBodyLogger = (req, res, next) => {
  // Skip logging for health checks
  if (req.path.includes('/health')) {
    return next();
  }

  // Only log for POST/PUT/PATCH
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  // Sanitized fields to exclude from logging
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'apiKey',
    'apiSecret',
    'accessToken',
    'refreshToken',
    'creditCard',
    'ssn',
    'encryptionKey',
  ];

  // Sanitize sensitive data
  const sanitizeData = (data) => {
    if (!data || typeof data !== 'object') return data;

    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Recursively sanitize nested objects
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = sanitizeData(sanitized[key]);
      }
    }

    return sanitized;
  };

  if (req.body) {
    const sanitizedBody = sanitizeData(req.body);
    const bodySize = JSON.stringify(req.body).length;

    logger.debug(`${req.method} ${req.path} - Body`, {
      requestId: req.requestId,
      bodySize: `${(bodySize / 1024).toFixed(2)}KB`,
      bodyKeys: Object.keys(sanitizedBody),
      body: sanitizedBody,
    });
  }

  next();
};

/**
 * Error response logger
 * Logs error responses with context
 */
const errorResponseLogger = (req, res, next) => {
  // Store original send function
  const originalSend = res.send;

  // Intercept response
  res.send = function (data) {
    // Log error responses
    if (res.statusCode >= 400 && data) {
      try {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

        logger.warn('Error Response', {
          requestId: req.requestId,
          statusCode: res.statusCode,
          error: parsedData.error || parsedData.message,
          path: req.path,
          method: req.method,
          clientId: req.clientId,
        });
      } catch (error) {
        // Ignore parsing errors
      }
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Slow request detection
 * Logs requests that exceed threshold
 */
const slowRequestDetector = (threshold = 1000) => {
  return (req, res, next) => {
    // Skip for health checks
    if (req.path.includes('/health')) {
      return next();
    }

    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;

      if (duration > threshold) {
        logger.warn('Slow Request Detected', {
          requestId: req.requestId,
          path: req.path,
          method: req.method,
          duration: `${duration}ms`,
          threshold: `${threshold}ms`,
          statusCode: res.statusCode,
          clientId: req.clientId,
        });
      }
    });

    next();
  };
};

/**
 * Request anomaly detector
 * Detects suspicious patterns (possible attacks)
 */
const anomalyDetector = (req, res, next) => {
  const anomalies = [];

  // Check for SQL injection patterns
  if (req.url.includes("'") || req.url.includes('"') || req.url.includes('--')) {
    anomalies.push('POSSIBLE_SQL_INJECTION');
  }

  // Check for XSS patterns
  if (req.url.includes('<') || req.url.includes('>') || req.url.includes('javascript:')) {
    anomalies.push('POSSIBLE_XSS');
  }

  // Check for command injection
  if (req.url.match(/[;&|`$()]/)) {
    anomalies.push('POSSIBLE_COMMAND_INJECTION');
  }

  // Check for unusual request size
  const contentLength = req.get('content-length');
  if (contentLength && parseInt(contentLength) > 1000000) {
    // 1MB
    anomalies.push('OVERSIZED_REQUEST');
  }

  // Check for missing user agent
  if (!req.get('user-agent')) {
    anomalies.push('MISSING_USER_AGENT');
  }

  // Check for suspicious headers
  const suspiciousHeaders = [
    'x-original-url',
    'x-rewrite-url',
    'x-forwarded-host',
  ];
  for (const header of suspiciousHeaders) {
    if (req.get(header) && req.get(header) !== req.get('host')) {
      anomalies.push('SUSPICIOUS_HEADERS');
      break;
    }
  }

  // Log anomalies
  if (anomalies.length > 0) {
    logger.warn('Request Anomaly Detected', {
      requestId: req.requestId,
      path: req.path,
      method: req.method,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      anomalies: anomalies,
    });
  }

  next();
};

/**
 * Performance metrics collector
 * Tracks performance statistics over time
 */
class PerformanceMetrics {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      totalErrors: 0,
      totalResponseTime: 0,
      slowRequests: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      responseTimes: [],
    };
  }

  /**
   * Record request metrics
   */
  recordRequest(statusCode, duration) {
    this.metrics.totalRequests++;
    this.metrics.totalResponseTime += duration;
    this.metrics.averageResponseTime = Math.round(
      this.metrics.totalResponseTime / this.metrics.totalRequests
    );

    if (statusCode >= 400) {
      this.metrics.totalErrors++;
    }

    if (duration > 1000) {
      this.metrics.slowRequests++;
    }

    // Track response times for percentiles
    this.metrics.responseTimes.push(duration);

    // Keep only last 1000 requests for percentile calculation
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }

    // Calculate percentiles
    const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    this.metrics.p95ResponseTime = sorted[p95Index] || 0;
    this.metrics.p99ResponseTime = sorted[p99Index] || 0;
  }

  /**
   * Get metrics summary
   */
  getMetrics() {
    return {
      totalRequests: this.metrics.totalRequests,
      totalErrors: this.metrics.totalErrors,
      errorRate: `${((this.metrics.totalErrors / this.metrics.totalRequests) * 100).toFixed(2)}%`,
      averageResponseTime: `${this.metrics.averageResponseTime}ms`,
      p95ResponseTime: `${this.metrics.p95ResponseTime}ms`,
      p99ResponseTime: `${this.metrics.p99ResponseTime}ms`,
      slowRequests: this.metrics.slowRequests,
      slowRequestPercentage: `${((this.metrics.slowRequests / this.metrics.totalRequests) * 100).toFixed(2)}%`,
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      totalRequests: 0,
      totalErrors: 0,
      totalResponseTime: 0,
      slowRequests: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      responseTimes: [],
    };
  }
}

const performanceMetrics = new PerformanceMetrics();

/**
 * Performance tracking middleware
 */
const performanceTracker = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    performanceMetrics.recordRequest(res.statusCode, duration);
  });

  next();
};

module.exports = {
  // Middleware
  requestLogger,
  requestBodyLogger,
  errorResponseLogger,
  anomalyDetector,
  performanceTracker,

  // Middleware factories
  slowRequestDetector,

  // Performance metrics
  performanceMetrics,
  PerformanceMetrics,
};
