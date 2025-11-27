/**
 * Agent Retry & Recovery Logic
 * 🔒 PHASE 2 FIX 2.3: Automatic retry on transient failures
 * 
 * Features:
 * - Exponential backoff retry strategy
 * - Automatic transient error detection
 * - Max retry limits enforcement
 * - Circuit breaker integration
 * - Comprehensive retry logging
 */

const logger = require('../utils/logger');

/**
 * Transient errors that should trigger retry
 */
const TRANSIENT_ERRORS = {
  // Network errors
  'ENOTFOUND': true,
  'ECONNREFUSED': true,
  'ECONNRESET': true,
  'ETIMEDOUT': true,
  'EHOSTUNREACH': true,

  // HTTP 5xx errors (server errors)
  500: true,
  502: true, // Bad Gateway
  503: true, // Service Unavailable
  504: true, // Gateway Timeout

  // Rate limiting (should retry after cooldown)
  429: true,

  // Incomplete responses
  'ERR_HTTP_REQUEST_TIMEOUT': true
};

/**
 * Retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterPercent: 10 // Add random jitter to prevent thundering herd
};

class RetryManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.retryStats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      circuitBreakerTriggered: 0
    };
  }

  /**
   * Determine if error is transient and should trigger retry
   */
  isTransientError(error) {
    // Check error code
    if (TRANSIENT_ERRORS[error.code]) {
      return true;
    }

    // Check HTTP status code
    if (TRANSIENT_ERRORS[error.statusCode]) {
      return true;
    }

    // Check error message
    if (error.message) {
      const msg = error.message.toLowerCase();
      if (msg.includes('timeout') || 
          msg.includes('econnrefused') ||
          msg.includes('enotfound') ||
          msg.includes('temporarily unavailable')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate delay with exponential backoff + jitter
   */
  calculateDelay(attemptNumber) {
    // Exponential backoff: delay = initialDelay * (multiplier ^ attempt)
    let delay = this.config.initialDelayMs * 
                Math.pow(this.config.backoffMultiplier, attemptNumber - 1);

    // Cap at maximum
    delay = Math.min(delay, this.config.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = delay * (this.config.jitterPercent / 100);
    const randomJitter = Math.random() * jitter * 2 - jitter;
    delay = Math.max(0, delay + randomJitter);

    return Math.round(delay);
  }

  /**
   * Wait for specified duration
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute function with automatic retry on failure
   */
  async execute(fn, context = {}) {
    const {
      name = 'operation',
      maxAttempts = this.config.maxAttempts,
      onRetry = null,
      circuitBreaker = null
    } = context;

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check circuit breaker before attempting
        if (circuitBreaker && circuitBreaker.isOpen()) {
          logger.warn('Circuit breaker is open, skipping attempt', {
            name,
            attempt,
            maxAttempts
          });
          throw new Error('Circuit breaker is open');
        }

        // Execute function
        logger.debug(`Executing: ${name} (attempt ${attempt}/${maxAttempts})`);
        const result = await fn();

        // Success - reset circuit breaker if present
        if (circuitBreaker) {
          circuitBreaker.recordSuccess();
        }

        if (attempt > 1) {
          logger.info(`✅ ${name} succeeded after retry`, {
            name,
            successfulAttempt: attempt
          });
          this.retryStats.successfulRetries++;
        }

        return result;

      } catch (error) {
        lastError = error;

        // Record failure in circuit breaker
        if (circuitBreaker) {
          circuitBreaker.recordFailure();
          if (circuitBreaker.isOpen()) {
            this.retryStats.circuitBreakerTriggered++;
          }
        }

        // Check if error is transient and we have more attempts
        const isTransient = this.isTransientError(error);
        const hasMoreAttempts = attempt < maxAttempts;

        if (!isTransient || !hasMoreAttempts) {
          // Non-transient error or no more attempts - throw immediately
          logger.error(`❌ ${name} failed`, {
            name,
            attempt,
            maxAttempts,
            isTransient,
            error: error.message,
            code: error.code
          });
          this.retryStats.failedRetries++;
          throw error;
        }

        // Transient error with remaining attempts - retry
        const delayMs = this.calculateDelay(attempt);
        logger.warn(`⚠️  ${name} failed (transient), retrying`, {
          name,
          attempt,
          maxAttempts,
          nextAttemptIn: `${delayMs}ms`,
          error: error.message,
          code: error.code
        });

        // Call retry callback if provided
        if (onRetry) {
          try {
            await onRetry(error, attempt, delayMs);
          } catch (callbackErr) {
            logger.error('Retry callback failed', { error: callbackErr.message });
          }
        }

        // Wait before retry
        await this.wait(delayMs);
        this.retryStats.totalRetries++;
      }
    }

    // All attempts exhausted
    logger.error(`❌ ${name} exhausted all ${maxAttempts} retry attempts`, {
      name,
      maxAttempts,
      finalError: lastError.message
    });
    this.retryStats.failedRetries++;
    throw lastError;
  }

  /**
   * Execute with retry for promise-based operations
   */
  async executePromise(promise, context = {}) {
    return this.execute(async () => promise, context);
  }

  /**
   * Get retry statistics
   */
  getStats() {
    return {
      ...this.retryStats,
      retrySuccessRate: this.retryStats.totalRetries > 0
        ? (this.retryStats.successfulRetries / this.retryStats.totalRetries * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.retryStats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      circuitBreakerTriggered: 0
    };
  }
}

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by stopping requests when service is down
 */
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureThreshold = threshold; // Failures before opening circuit
    this.timeout = timeout; // Time to wait before trying half-open state
    this.failureCount = 0;
    this.successCount = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.lastFailureTime = null;
  }

  /**
   * Record successful call
   */
  recordSuccess() {
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.info('Circuit breaker closed (service recovered)');
    }
  }

  /**
   * Record failed call
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold && this.state === 'CLOSED') {
      this.state = 'OPEN';
      logger.error('Circuit breaker opened (service down)', {
        failures: this.failureCount,
        threshold: this.failureThreshold
      });
    }
  }

  /**
   * Check if circuit should allow request
   */
  isOpen() {
    if (this.state === 'OPEN') {
      // Check if timeout has passed to try half-open state
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        this.failureCount = 0;
        logger.info('Circuit breaker half-open (testing recovery)');
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Get circuit breaker state
   */
  getState() {
    return {
      state: this.state,
      failures: this.failureCount,
      threshold: this.failureThreshold,
      timeUntilRetry: this.state === 'OPEN'
        ? Math.max(0, this.timeout - (Date.now() - this.lastFailureTime))
        : 0
    };
  }
}

/**
 * Retry decorator for async functions
 */
function withRetry(fn, config = {}) {
  const retryManager = new RetryManager(config);
  
  return async function(...args) {
    return retryManager.execute(
      () => fn.apply(this, args),
      { name: fn.name || 'async_operation' }
    );
  };
}

module.exports = {
  RetryManager,
  CircuitBreaker,
  withRetry,
  TRANSIENT_ERRORS,
  DEFAULT_RETRY_CONFIG
};
