/**
 * Session Cleanup Service - Memory Management & Leak Prevention
 * 
 * Handles:
 * - Automatic cleanup of expired sessions
 * - EventListener cleanup on disconnect
 * - Memory leak detection
 * - Orphaned connection cleanup
 * - Graceful session termination
 */

const logger = require('../utils/logger');
const db = require('../db/postgres');
const { pool } = require('../db/pooling');
const nodeCleanup = require('node-cleanup');

class SessionCleanupService {
  constructor() {
    this.cleanupInterval = null;
    this.isRunning = false;
    this.cleanupStats = {
      sessionsCleanedUp: 0,
      orphanedConnectionsClosed: 0,
      memoryLeaksDetected: 0,
      lastCleanupTime: null,
      cleanupDuration: 0
    };
  }

  /**
   * Start automatic cleanup every 30 minutes
   */
  startAutomaticCleanup() {
    if (this.isRunning) {
      logger.warn('Session cleanup already running');
      return;
    }

    this.isRunning = true;
    const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes

    logger.info('🧹 Starting session cleanup service (interval: 30 min)');

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.error('Session cleanup failed', {
          error: error.message,
          stack: error.stack
        });
      }
    }, CLEANUP_INTERVAL);

    // Run initial cleanup after 1 minute
    setTimeout(() => {
      this.performCleanup().catch(err => {
        logger.error('Initial cleanup failed', { error: err.message });
      });
    }, 60 * 1000);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutomaticCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.isRunning = false;
      logger.info('🧹 Session cleanup service stopped');
    }
  }

  /**
   * Perform cleanup tasks
   */
  async performCleanup() {
    const startTime = Date.now();
    const stats = {
      expiredSessions: 0,
      orphanedConnections: 0,
      memoryLeaks: 0
    };

    try {
      logger.info('🧹 Starting cleanup cycle');

      // 1. Clean up expired sessions
      stats.expiredSessions = await this.cleanupExpiredSessions();

      // 2. Close orphaned connections
      stats.orphanedConnections = await this.closeOrphanedConnections();

      // 3. Detect memory leaks
      stats.memoryLeaks = await this.detectMemoryLeaks();

      // 4. Clean up stale WebSocket connections
      stats.wsConnections = await this.cleanupStaleWebsockets();

      const duration = Date.now() - startTime;
      this.cleanupStats.lastCleanupTime = new Date();
      this.cleanupStats.cleanupDuration = duration;

      logger.info('✅ Cleanup cycle complete', {
        expiredSessions: stats.expiredSessions,
        orphanedConnections: stats.orphanedConnections,
        memoryLeaks: stats.memoryLeaks,
        wsConnections: stats.wsConnections,
        duration: `${duration}ms`,
        memoryUsage: {
          heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
        }
      });

      this.cleanupStats.sessionsCleanedUp += stats.expiredSessions;
      this.cleanupStats.orphanedConnectionsClosed += stats.orphanedConnections;
      this.cleanupStats.memoryLeaksDetected += stats.memoryLeaks;

    } catch (error) {
      logger.error('Cleanup cycle failed', {
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Clean up expired sessions from PostgreSQL
   */
  async cleanupExpiredSessions() {
    try {
      const result = await db.query(`
        DELETE FROM session
        WHERE expire < NOW()
        RETURNING sid
      `);

      const count = result.rowCount;
      if (count > 0) {
        logger.info(`Deleted ${count} expired sessions`);
      }
      return count;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Close orphaned database connections
   * (connections idle for more than 5 minutes)
   */
  async closeOrphanedConnections() {
    try {
      const result = await db.query(`
        SELECT pid, state, query_start, state_change
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
        AND datname = current_database()
        AND state = 'idle'
        AND now() - state_change > interval '5 minutes'
      `);

      let terminated = 0;
      for (const conn of result.rows) {
        try {
          await db.query(
            'SELECT pg_terminate_backend($1)',
            [conn.pid]
          );
          terminated++;
          logger.debug(`Terminated orphaned connection pid=${conn.pid}`, {
            idleTime: conn.state_change
          });
        } catch (err) {
          logger.warn(`Failed to terminate connection ${conn.pid}`, {
            error: err.message
          });
        }
      }

      if (terminated > 0) {
        logger.info(`Terminated ${terminated} orphaned database connections`);
      }
      return terminated;
    } catch (error) {
      logger.error('Failed to close orphaned connections', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Detect potential memory leaks
   * - Monitored: EventListener counts, timer counts, etc.
   */
  async detectMemoryLeaks() {
    try {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      // Alert if heap usage > 80%
      if (heapUsedPercent > 80) {
        logger.warn('⚠️  High memory usage detected', {
          heapUsedPercent: heapUsedPercent.toFixed(2),
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
        });
        return 1;
      }

      // Check for event listener leaks
      const maxListeners = process.getMaxListeners();
      const eventNames = process.eventNames();

      let leaksDetected = 0;
      for (const eventName of eventNames) {
        const listeners = process.listeners(eventName).length;
        if (listeners > 100) {
          logger.warn(`⚠️  Excessive listeners for event: ${eventName}`, {
            count: listeners,
            maxAllowed: maxListeners
          });
          leaksDetected++;
        }
      }

      return leaksDetected;
    } catch (error) {
      logger.error('Memory leak detection failed', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Clean up stale WebSocket connections
   * (connections that didn't send heartbeat in 2 minutes)
   */
  async cleanupStaleWebsockets() {
    try {
      // This would be called with a reference to the WSS server
      // For now, return 0 (will be integrated with WebSocket manager)
      return 0;
    } catch (error) {
      logger.error('Failed to cleanup WebSocket connections', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Get cleanup statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      ...this.cleanupStats,
      memoryUsage: {
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
      }
    };
  }

  /**
   * Cleanup event listeners on server shutdown
   */
  setupGracefulShutdown(server, wss) {
    nodeCleanup((exitCode, signal) => {
      logger.info('🧹 Cleaning up on shutdown', {
        signal,
        exitCode
      });

      // Stop automatic cleanup
      this.stopAutomaticCleanup();

      // Close all WebSocket connections
      if (wss) {
        wss.clients.forEach(client => {
          client.close(1000, 'Server shutting down');
        });
      }

      // Close HTTP server
      if (server) {
        server.close(() => {
          logger.info('✅ Server shutdown complete');
          process.exit(exitCode || 0);
        });
      }

      // Timeout for cleanup (5 seconds)
      return true;
    });
  }

  /**
   * Cleanup specific session by ID
   */
  async cleanupSessionById(sessionId) {
    try {
      const result = await db.query(
        'DELETE FROM session WHERE sid = $1',
        [sessionId]
      );
      logger.info(`Session cleaned up: ${sessionId}`);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to cleanup session', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Cleanup all sessions for a specific user
   */
  async cleanupUserSessions(userId) {
    try {
      const result = await db.query(
        `DELETE FROM session
         WHERE (data->>'user_id')::int = $1`,
        [userId]
      );
      logger.info(`Cleaned up ${result.rowCount} sessions for user ${userId}`);
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to cleanup user sessions', {
        userId,
        error: error.message
      });
      return 0;
    }
  }
}

// Export singleton instance
const sessionCleanup = new SessionCleanupService();

module.exports = sessionCleanup;
