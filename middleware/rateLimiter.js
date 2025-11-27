/**
 * Rate Limiter Middleware Module
 * 
 * Prevents brute-force attacks, DDoS, and resource exhaustion through
 * request rate limiting. Supports per-IP and per-client limiting.
 * 
 * Current Implementation: In-memory store (suitable for single-server)
 * Future Enhancement: Can be upgraded to Redis for distributed systems
 * 
 * Features:
 * - Configurable request limits and time windows
 * - Automatic cleanup of expired entries (every 60 seconds)
 * - X-RateLimit headers for client feedback
 * - Retry-After header for rate-limited responses
 * 
 * @module middleware/rateLimiter
 * @requires middleware/errorHandler
 */

const { RateLimitError } = require('./errorHandler');

/**
 * In-Memory Rate Limit Store
 * 
 * Stores request counts per identifier with automatic expiration.
 * Thread-safe Map with background cleanup process.
 * 
 * Store Structure:
 * - Key: Request identifier (IP address, user ID, or combination)
 * - Value: { count, resetTime } where resetTime is timestamp in milliseconds
 * 
 * Cleanup: Runs every 60 seconds to remove expired entries
 * 
 * @class RateLimitStore
 * 
 * @example
 * const store = new RateLimitStore();
 * const isAllowed = store.check('192.168.1.1', 100, 15*60*1000);
 */
class RateLimitStore {
  /**
   * Initialize a new rate limit store
   */
  constructor() {
    this.requests = new Map();
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  /**
   * Check and increment request count
   * 
   * Maintains count within specified window. When window expires,
   * automatically resets counter for the key.
   * 
   * @param {string} key - Unique identifier (IP, user ID, etc.)
   * @param {number} [limit=100] - Maximum requests allowed in window
   * @param {number} [windowMs=15*60*1000] - Time window in milliseconds (default: 15 minutes)
   * @returns {boolean} true if within limit, false if limit exceeded
   * 
   * @example
   * const isAllowed = store.check('user:123', 10, 60000);  // 10 requests per minute
   * if (!isAllowed) {
   *   res.status(429).json({ error: 'Rate limit exceeded' });
   * }
   */
  check(key, limit = 100, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const record = this.requests.get(key);

    if (!record) {
      // First request in window
      this.requests.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (now > record.resetTime) {
      // Window expired, reset
      this.requests.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    // Within window
    record.count++;
    return record.count <= limit;
  }

  /**
   * Get remaining requests in current window
   * 
   * @param {string} key - Request identifier
   * @param {number} [limit=100] - Request limit
   * @param {number} [windowMs=15*60*1000] - Time window in milliseconds
   * @returns {number} Remaining requests (0 or positive)
   * 
   * @example
   * const remaining = store.getRemaining('192.168.1.1', 100, 15*60*1000);
   * console.log(`${remaining} requests remaining`);
   */
  getRemaining(key, limit = 100, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      return limit;
    }

    return Math.max(0, limit - record.count);
  }

  /**
   * Get the reset time for a rate limit key
   * 
   * @param {string} key - Request identifier
   * @returns {number|null} Timestamp when limit resets, or null if not found
   * 
   * @example
   * const resetTime = store.getResetTime('192.168.1.1');
   * if (resetTime) {
   *   const secondsUntilReset = (resetTime - Date.now()) / 1000;
   *   console.log(`Reset in ${secondsUntilReset} seconds`);
   * }
   */
  getResetTime(key) {
    const record = this.requests.get(key);
    return record ? record.resetTime : null;
  }

  /**
   * Remove expired entries from store
   * 
   * Called automatically every 60 seconds.
   * Can be called manually to force cleanup.
   * 
   * @function
   */
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  /**
   * Clear all stored rate limit data
   * 
   * Useful for testing. Clears all keys and counters
   * but keeps the store running.
   * 
   * @function
   * 
   * @example
   * // In unit tests
   * beforeEach(() => store.clear());
   */
  clear() {
    this.requests.clear();
  }

  /**
   * Destroy store and cleanup resources
   * 
   * Stops background cleanup interval and clears all data.
   * Call this when shutting down the application.
   * 
   * @function
   * 
   * @example
   * process.on('SIGTERM', () => {
   *   store.destroy();
   *   process.exit(0);
   * });
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.requests.clear();
  }
}

const store = new RateLimitStore();

/**
 * Create a Rate Limiter Middleware
 * 
 * Factory function for creating configurable rate limiting middleware.
 * Supports custom key generation (per-IP, per-user, per-endpoint, etc.).
 * 
 * Default Behavior:
 * - Limits by client IP address
 * - 100 requests per 15 minutes
 * - Returns 429 Too Many Requests when limit exceeded
 * 
 * Rate Limit Headers (set on all responses):
 * - X-RateLimit-Limit: Maximum requests allowed
 * - X-RateLimit-Remaining: Requests remaining in current window
 * - X-RateLimit-Reset: Unix timestamp when window resets
 * - Retry-After: (429 responses only) Seconds until retry allowed
 * 
 * @function createRateLimiter
 * @param {Object} [options={}] - Configuration options
 * @param {number} [options.windowMs=900000] - Time window in milliseconds (default: 15 minutes)
 * @param {number} [options.max=100] - Maximum requests per window
 * @param {Function} [options.keyGenerator] - Function to generate rate limit key
 *   - Signature: (req) => string
 *   - Default: uses client IP address
 * @param {Function} [options.skip] - Function to skip rate limiting
 *   - Signature: (req) => boolean
 *   - Default: never skip (returns false)
 * @param {Function} [options.handler] - Custom error handler
 *   - Signature: (req, res, next) => void
 *   - Default: throw RateLimitError (caught by errorHandler middleware)
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Basic usage - limit by IP
 * const limiter = createRateLimiter({ max: 100, windowMs: 15*60*1000 });
 * app.use('/api/', limiter);
 * 
 * @example
 * // Limit by user ID
 * const userLimiter = createRateLimiter({
 *   max: 50,
 *   keyGenerator: (req) => req.userId || req.ip
 * });
 * app.use('/api/sensitive', userLimiter);
 * 
 * @example
 * // Skip rate limiting for admins
 * const protectedLimiter = createRateLimiter({
 *   max: 10,
 *   skip: (req) => req.isAdmin === true
 * });
 * app.use('/api/admin', protectedLimiter);
 * 
 * @example
 * // Custom handler for rate limit errors
 * const customLimiter = createRateLimiter({
 *   max: 5,
 *   handler: (req, res, next) => {
 *     res.status(429).json({
 *       error: 'Custom rate limit message',
 *       retryAfter: res.get('Retry-After')
 *     });
 *   }
 * });
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // Max requests per window
    keyGenerator = (req) => req.ip || req.connection.remoteAddress, // Key for grouping
    skip = () => false, // Function to skip rate limiting
    handler = null, // Custom error handler
  } = options;

  return (req, res, next) => {
    if (skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const isAllowed = store.check(key, max, windowMs);
    const remaining = store.getRemaining(key, max, windowMs);
    const resetTime = store.getResetTime(key);

    // Set rate limit headers
    res.set('X-RateLimit-Limit', max);
    res.set('X-RateLimit-Remaining', remaining);
    res.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

    if (!isAllowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      res.set('Retry-After', retryAfter);

      if (handler) {
        return handler(req, res, next);
      }

      const error = new RateLimitError(retryAfter);
      return next(error);
    }

    next();
  };
};

/**
 * Login rate limiter - strict (6 attempts per 15 minutes)
 */
const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 6, // 6 attempts
  keyGenerator: (req) => {
    // Use email + IP for more granular control
    const email = req.body?.email || req.ip;
    return `login-${email}`;
  },
});

/**
 * ✅ PHASE 2 FIX 2.3: Registration rate limiter - strict (5 per 15 minutes per IP)
 */
const registerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 registration attempts
  keyGenerator: (req) => {
    // Rate limit by IP address
    return `register-${req.ip}`;
  },
  message: 'Too many registration attempts, please try again later',
});

/**
 * ✅ PHASE 2 FIX 2.3: Email verification rate limiter - strict (5 per 5 minutes per email)
 */
const verifyEmailRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 verification attempts
  keyGenerator: (req) => {
    // Rate limit by email address
    const email = req.body?.email || req.ip;
    return `verify-email-${email}`;
  },
  message: 'Too many verification attempts, please try again later',
});

/**
 * ✅ PHASE 2 FIX 2.3: Resend OTP rate limiter - moderate (3 per 2 minutes per email)
 */
const resendOtpRateLimiter = createRateLimiter({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 3, // 3 resend attempts
  keyGenerator: (req) => {
    // Rate limit by email address
    const email = req.body?.email || req.ip;
    return `resend-otp-${email}`;
  },
  message: 'Please wait before requesting another OTP',
});

/**
 * API rate limiter - moderate (100 requests per 15 minutes)
 */
const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  keyGenerator: (req) => {
    // Use client ID if authenticated, else IP
    return req.clientId ? `api-${req.clientId}` : `api-${req.ip}`;
  },
  skip: (req) => req.method === 'GET' && req.path.includes('/health'), // Skip health checks
});

/**
 * Webhook rate limiter - lenient (1000 requests per minute)
 * Webhooks can have high traffic legitimately
 */
const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 1000,
  keyGenerator: (req) => {
    // Group by webhook endpoint and source
    return `webhook-${req.path}`;
  },
});

/**
 * File upload rate limiter - strict (10 uploads per hour)
 */
const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => {
    return req.clientId ? `upload-${req.clientId}` : `upload-${req.ip}`;
  },
});

/**
 * Custom rate limiter for specific endpoints
 * @param {number} max - Max requests per window
 * @param {number} windowMs - Time window in ms
 */
const customRateLimiter = (max = 100, windowMs = 15 * 60 * 1000) => {
  return createRateLimiter({
    windowMs,
    max,
    keyGenerator: (req) => {
      return req.clientId ? `custom-${req.clientId}` : `custom-${req.ip}`;
    },
  });
};

/**
 * Reset rate limit for a specific key (useful for testing/admin)
 */
const resetRateLimit = (key) => {
  store.requests.delete(key);
};

/**
 * Get rate limit stats (for monitoring)
 */
const getRateLimitStats = () => {
  const stats = {
    activeKeys: store.requests.size,
    entries: [],
  };

  for (const [key, record] of store.requests.entries()) {
    const now = Date.now();
    const timeRemaining = Math.max(0, record.resetTime - now);

    stats.entries.push({
      key,
      count: record.count,
      resetTime: new Date(record.resetTime),
      timeRemaining: `${Math.ceil(timeRemaining / 1000)}s`,
    });
  }

  return stats;
};

module.exports = {
  // Rate limiter factory
  createRateLimiter,

  // Pre-configured limiters
  loginRateLimiter,
  registerRateLimiter,
  verifyEmailRateLimiter,
  resendOtpRateLimiter,
  apiRateLimiter,
  webhookRateLimiter,
  uploadRateLimiter,
  customRateLimiter,

  // Store management
  store,
  resetRateLimit,
  getRateLimitStats,

  // Export store class for advanced usage
  RateLimitStore,
};
