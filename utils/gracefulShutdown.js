const logger = require('./logger');

/**
 * Graceful Shutdown Handler
 * Cleanly closes database, cache, and pending requests
 * Prevents data corruption on redeploy/restart
 * 
 * Usage in server.js:
 *   const GracefulShutdown = require('./utils/gracefulShutdown');
 *   const shutdown = new GracefulShutdown(server, db, redisClient);
 *   shutdown.attachHandlers();
 */

class GracefulShutdown {
  constructor(server, db, redisClient) {
    this.server = server;
    this.db = db;
    this.redisClient = redisClient;
    this.isShuttingDown = false;
    this.activeRequests = new Set();
  }

  /**
   * Track active HTTP requests
   * Called from middleware to monitor in-flight requests
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  trackRequest(req, res) {
    this.activeRequests.add(req);
    
    // Remove from tracking when response finishes
    res.on('finish', () => {
      this.activeRequests.delete(req);
    });
    
    // Also track when connection closes unexpectedly
    res.on('close', () => {
      this.activeRequests.delete(req);
    });
  }

  /**
   * Start graceful shutdown sequence
   * @param {string} signal - Signal received (SIGTERM, SIGINT, etc)
   */
  async shutdown(signal) {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.warn(`\n${signal} received. Starting graceful shutdown...`);

    try {
      // Step 1: Stop accepting new requests
      logger.info('Stopping HTTP server from accepting new connections...');
      this.server.close(() => {
        logger.info('HTTP server closed, no more requests accepted');
      });

      // Step 2: Wait for active requests to complete (max 30 seconds)
      await this.drainActiveRequests();

      // Step 3: Close database connections
      await this.closeDatabase();

      // Step 4: Close Redis connections
      await this.closeRedis();

      // Step 5: Log shutdown complete
      logger.info('✓ Graceful shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('✗ Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Wait for all active requests to complete
   * Force close after timeout to prevent indefinite hanging
   * @param {number} timeout - Max wait time in milliseconds
   * @private
   */
  async drainActiveRequests(timeout = 30000) {
    const startTime = Date.now();
    
    const checkRequests = () => {
      if (this.activeRequests.size === 0) {
        logger.info('All active requests completed');
        return Promise.resolve();
      }

      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > timeout) {
        logger.warn(
          `Timeout waiting for requests (${this.activeRequests.size} still active). Forcing shutdown.`
        );
        // Force-close remaining connections
        this.activeRequests.forEach(req => {
          if (req.socket) {
            req.socket.destroy();
          }
        });
        return Promise.resolve();
      }

      logger.info(`Waiting for ${this.activeRequests.size} active request(s) to complete...`);
      return new Promise(resolve => setTimeout(() => checkRequests().then(resolve), 1000));
    };

    return checkRequests();
  }

  /**
   * Close database connection pool
   * Drains existing connections and destroys pool
   * @private
   */
  async closeDatabase() {
    if (!this.db) return;

    try {
      logger.info('Closing database connections...');
      
      // Handle pg library
      if (this.db.pool) {
        // Drain existing connections
        if (this.db.pool.drain) {
          await this.db.pool.drain();
        }
        // Destroy the pool
        if (this.db.pool.clear) {
          await this.db.pool.clear();
        }
      }
      
      // Handle direct connection
      if (this.db.end) {
        await this.db.end();
      }

      logger.info('Database connections closed');
    } catch (error) {
      logger.error('Error closing database:', error);
      throw error;
    }
  }

  /**
   * Close Redis connection
   * Gracefully closes client without losing data
   * @private
   */
  async closeRedis() {
    if (!this.redisClient) return;

    try {
      logger.info('Closing Redis connection...');
      
      if (this.redisClient.disconnect) {
        await this.redisClient.disconnect();
      } else if (this.redisClient.quit) {
        await this.redisClient.quit();
      } else if (this.redisClient.close) {
        await this.redisClient.close();
      }

      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis:', error);
      throw error;
    }
  }

  /**
   * Attach shutdown handlers to process signals
   * Listens for SIGTERM, SIGINT, and uncaught errors
   * @public
   */
  attachHandlers() {
    // Handle termination signals
    ['SIGTERM', 'SIGINT'].forEach(signal => {
      process.on(signal, () => this.shutdown(signal));
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      this.shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.shutdown('unhandledRejection');
    });

    logger.info('Graceful shutdown handlers attached');
  }
}

module.exports = GracefulShutdown;
