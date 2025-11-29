/**
 * Cache Manager Service
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Manages caching strategies for dashboard data and frequently accessed metrics
 */

const logger = require('../utils/logger');

/**
 * CacheManager Service
 * In-memory cache for high-frequency data (Redis integration ready)
 */
class CacheManager {
  static _cache = {};
  static _ttl = {};

  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds (default 5 minutes)
   */
  static set(key, value, ttlSeconds = 300) {
    try {
      this._cache[key] = value;
      this._ttl[key] = Date.now() + (ttlSeconds * 1000);

      logger.debug('Cache set', { key, ttlSeconds });

      // Set auto-expiration
      if (ttlSeconds > 0) {
        setTimeout(() => {
          this.delete(key);
        }, ttlSeconds * 1000);
      }

      return true;
    } catch (error) {
      logger.error('Error setting cache', { error: error.message, key });
      return false;
    }
  }

  /**
   * Get cache value
   * @param {string} key - Cache key
   */
  static get(key) {
    try {
      if (!this._cache.hasOwnProperty(key)) {
        logger.debug('Cache miss', { key });
        return null;
      }

      // Check if expired
      if (this._ttl[key] && Date.now() > this._ttl[key]) {
        this.delete(key);
        logger.debug('Cache expired', { key });
        return null;
      }

      logger.debug('Cache hit', { key });
      return this._cache[key];
    } catch (error) {
      logger.error('Error getting cache', { error: error.message, key });
      return null;
    }
  }

  /**
   * Delete cache value
   */
  static delete(key) {
    try {
      delete this._cache[key];
      delete this._ttl[key];
      logger.debug('Cache deleted', { key });
      return true;
    } catch (error) {
      logger.error('Error deleting cache', { error: error.message, key });
      return false;
    }
  }

  /**
   * Clear all cache (or by pattern)
   */
  static clear(pattern = null) {
    try {
      if (!pattern) {
        this._cache = {};
        this._ttl = {};
        logger.info('All cache cleared');
        return true;
      }

      // Clear by pattern
      const regex = new RegExp(pattern);
      const keysToDelete = Object.keys(this._cache).filter(k => regex.test(k));

      keysToDelete.forEach(key => {
        delete this._cache[key];
        delete this._ttl[key];
      });

      logger.info('Cache cleared by pattern', { pattern, keysDeleted: keysToDelete.length });
      return keysToDelete.length;
    } catch (error) {
      logger.error('Error clearing cache', { error: error.message });
      return false;
    }
  }

  /**
   * Get or set cache value (with fetcher function)
   */
  static async getOrSet(key, fetcher, ttlSeconds = 300) {
    try {
      // Try to get from cache
      const cached = this.get(key);
      if (cached !== null) {
        return cached;
      }

      // Fetch if not in cache
      logger.debug('Cache miss, fetching data', { key });
      const value = await fetcher();

      // Store in cache
      this.set(key, value, ttlSeconds);

      return value;
    } catch (error) {
      logger.error('Error in getOrSet', { error: error.message, key });
      throw error;
    }
  }

  /**
   * Cache performance metrics
   */
  static cachePerformanceMetrics(clientId, metrics, ttlSeconds = 300) {
    const key = `perf_metrics:${clientId}`;
    return this.set(key, metrics, ttlSeconds);
  }

  /**
   * Get cached performance metrics
   */
  static getPerformanceMetrics(clientId) {
    const key = `perf_metrics:${clientId}`;
    return this.get(key);
  }

  /**
   * Cache dashboard data
   */
  static cacheDashboardData(clientId, dashboardData, ttlSeconds = 600) {
    const key = `dashboard:${clientId}`;
    return this.set(key, dashboardData, ttlSeconds);
  }

  /**
   * Get cached dashboard data
   */
  static getDashboardData(clientId) {
    const key = `dashboard:${clientId}`;
    return this.get(key);
  }

  /**
   * Cache agent rankings
   */
  static cacheAgentRankings(clientId, rankings, ttlSeconds = 900) {
    const key = `rankings:${clientId}`;
    return this.set(key, rankings, ttlSeconds);
  }

  /**
   * Cache sector data
   */
  static cacheSectorData(clientId, sectorKey, sectorData, ttlSeconds = 600) {
    const key = `sector:${clientId}:${sectorKey}`;
    return this.set(key, sectorData, ttlSeconds);
  }

  /**
   * Get cache statistics
   */
  static getStats() {
    return {
      totalKeys: Object.keys(this._cache).length,
      cacheSize: this._estimateCacheSize(),
      keys: Object.keys(this._cache),
      ttlData: this._ttl
    };
  }

  /**
   * Estimate cache size in bytes
   * @private
   */
  static _estimateCacheSize() {
    let size = 0;
    for (const key in this._cache) {
      const value = this._cache[key];
      if (typeof value === 'string') {
        size += value.length;
      } else if (typeof value === 'object') {
        size += JSON.stringify(value).length;
      }
    }
    return size;
  }

  /**
   * Set cache invalidation for client
   * Called after data updates
   */
  static invalidateClientCache(clientId) {
    try {
      const patterns = [
        `perf_metrics:${clientId}`,
        `dashboard:${clientId}`,
        `rankings:${clientId}`,
        `sector:${clientId}:.*`
      ];

      let invalidatedCount = 0;
      patterns.forEach(pattern => {
        invalidatedCount += this.clear(pattern) || 0;
      });

      logger.info('Client cache invalidated', {
        clientId,
        entriesInvalidated: invalidatedCount
      });

      return invalidatedCount;
    } catch (error) {
      logger.error('Error invalidating client cache', {
        error: error.message,
        clientId
      });
      return 0;
    }
  }

  /**
   * Warm cache with frequently accessed data
   */
  static async warmCache(clientId, warmerFunction) {
    try {
      logger.info('Warming cache for client', { clientId });

      const result = await warmerFunction();

      logger.info('Cache warm complete', {
        clientId,
        itemsWarmed: Object.keys(result).length
      });

      return result;
    } catch (error) {
      logger.error('Error warming cache', {
        error: error.message,
        clientId
      });
      throw error;
    }
  }

  /**
   * Check cache health
   */
  static healthCheck() {
    const stats = this.getStats();
    const health = {
      status: 'healthy',
      cacheSize: stats.cacheSize,
      totalKeys: stats.totalKeys,
      warnings: []
    };

    // Check cache size (warn if > 50MB)
    if (stats.cacheSize > 50 * 1024 * 1024) {
      health.status = 'degraded';
      health.warnings.push('Cache size exceeding 50MB');
    }

    // Check key count (warn if > 10000)
    if (stats.totalKeys > 10000) {
      health.status = 'degraded';
      health.warnings.push('Cache contains more than 10,000 keys');
    }

    return health;
  }
}

module.exports = CacheManager;
