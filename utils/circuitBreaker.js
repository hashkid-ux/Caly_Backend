/**
 * Circuit Breaker Pattern - Prevent cascading failures
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service failing, requests fail fast without attempting
 * - HALF_OPEN: Testing if service recovered, selective requests allowed
 * 
 * Features:
 * - Automatic state transitions
 * - Configurable thresholds and timeouts
 * - Event tracking and metrics
 * - Multiple service management
 */

const logger = require('./logger');

const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'CircuitBreaker';
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 60 seconds
    this.halfOpenRequests = options.halfOpenRequests || 1;

    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    // Metrics
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.stateChanges = [];

    logger.info(`🔌 Circuit breaker '${this.name}' initialized`);
  }

  /**
   * Check if request should be allowed
   */
  isAllowed() {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if timeout expired - transition to HALF_OPEN
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN state - allow limited requests
    if (this.halfOpenAttempts < this.halfOpenRequests) {
      this.halfOpenAttempts++;
      return true;
    }

    return false;
  }

  /**
   * Record successful request
   */
  recordSuccess() {
    this.totalRequests++;
    this.totalSuccesses++;

    if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
      return;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        logger.info(`✅ [${this.name}] Service recovered - closing circuit`);
        this.transitionTo(CircuitState.CLOSED);
        this.resetCounters();
      }
    }
  }

  /**
   * Record failed request
   */
  recordFailure(error) {
    this.totalRequests++;
    this.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.CLOSED) {
      if (this.failureCount >= this.failureThreshold) {
        logger.warn(
          `⚠️  [${this.name}] Failure threshold reached (${this.failureCount}/${this.failureThreshold}) - opening circuit`,
          { error: error?.message }
        );
        this.transitionTo(CircuitState.OPEN);
        this.nextAttemptTime = Date.now() + this.timeout;
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      logger.warn(`⚠️  [${this.name}] Recovery failed - reopening circuit`, {
        error: error?.message,
      });
      this.transitionTo(CircuitState.OPEN);
      this.nextAttemptTime = Date.now() + this.timeout;
      this.successCount = 0;
    }
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn, onOpen = null) {
    if (!this.isAllowed()) {
      const error = new Error(
        `Circuit breaker '${this.name}' is ${this.state} - request rejected`
      );
      error.code = 'CIRCUIT_BREAKER_OPEN';
      error.state = this.state;

      if (onOpen) {
        return onOpen(error);
      }

      throw error;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Transition to new state
   */
  transitionTo(newState) {
    if (this.state !== newState) {
      logger.info(`🔌 [${this.name}] State transition: ${this.state} → ${newState}`);
      this.state = newState;
      this.stateChanges.push({
        from: this.state,
        to: newState,
        timestamp: new Date().toISOString(),
      });

      if (newState === CircuitState.HALF_OPEN) {
        this.halfOpenAttempts = 0;
      }
    }
  }

  /**
   * Reset internal counters
   */
  resetCounters() {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = null;
  }

  /**
   * Get current state and metrics
   */
  getMetrics() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      failureRate: this.totalRequests > 0
        ? ((this.totalFailures / this.totalRequests) * 100).toFixed(2) + '%'
        : 'N/A',
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime).toISOString()
        : null,
      nextAttemptTime: this.nextAttemptTime
        ? new Date(this.nextAttemptTime).toISOString()
        : null,
      stateChanges: this.stateChanges.slice(-10), // Last 10 state changes
    };
  }

  /**
   * Reset to initial state
   */
  reset() {
    logger.info(`🔌 [${this.name}] Circuit breaker reset`);
    this.state = CircuitState.CLOSED;
    this.resetCounters();
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.stateChanges = [];
  }
}

/**
 * Global circuit breaker manager
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Create or get circuit breaker
   */
  getOrCreate(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ name, ...options }));
    }
    return this.breakers.get(name);
  }

  /**
   * Get all breakers status
   */
  getAllMetrics() {
    const metrics = {};
    this.breakers.forEach((breaker, name) => {
      metrics[name] = breaker.getMetrics();
    });
    return metrics;
  }

  /**
   * Reset all breakers
   */
  resetAll() {
    logger.info('🔌 Resetting all circuit breakers');
    this.breakers.forEach(breaker => breaker.reset());
  }
}

// Global instance
const manager = new CircuitBreakerManager();

// Pre-create common service breakers
const exotelBreaker = manager.getOrCreate('exotel', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
});

const openaiBreaker = manager.getOrCreate('openai', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
});

const wasabiBreaker = manager.getOrCreate('wasabi', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 90000, // Longer timeout for storage
});

const shopifyBreaker = manager.getOrCreate('shopify', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
});

const dbBreaker = manager.getOrCreate('database', {
  failureThreshold: 10,
  successThreshold: 3,
  timeout: 60000,
});

module.exports = {
  CircuitBreaker,
  CircuitBreakerManager,
  manager,
  // Pre-created service breakers
  exotelBreaker,
  openaiBreaker,
  wasabiBreaker,
  shopifyBreaker,
  dbBreaker,
  // Utilities
  CircuitState,
};
