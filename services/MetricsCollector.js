/**
 * Metrics Collector Service
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Collects real-time metrics from calls and agents
 */

const db = require('../db/postgres');
const logger = require('../utils/logger');

/**
 * MetricsCollector Service
 * Handles real-time metric collection and validation
 */
class MetricsCollector {
  /**
   * Collect call metrics from completed call
   * @param {string} clientId - Client ID
   * @param {string} callId - Call ID
   * @param {object} callData - Call data from webhook
   */
  static async collectCallMetrics(clientId, callId, callData) {
    try {
      logger.info('Collecting call metrics', {
        clientId,
        callId
      });

      const {
        agentId,
        talkTime = 0,
        holdTime = 0,
        wrapTime = 0,
        qualityScore = 3.0,
        transferred = false,
        escalated = false,
        completed = true,
        firstContactResolved = false
      } = callData;

      const totalHandleTime = talkTime + holdTime + wrapTime;

      // Validate metrics
      if (totalHandleTime < 0 || qualityScore < 0 || qualityScore > 5) {
        logger.warn('Invalid metrics received', {
          callId,
          metrics: { totalHandleTime, qualityScore }
        });
        return null;
      }

      // Calculate productivity score
      const productivityScore = this._calculateProductivityScore(
        totalHandleTime,
        qualityScore,
        firstContactResolved
      );

      // Get average utilization for agent
      const utilization = await this._calculateAgentUtilization(agentId);

      const query = `
        INSERT INTO agent_metrics (
          client_id,
          agent_id,
          call_id,
          talk_time_seconds,
          hold_time_seconds,
          wrap_time_seconds,
          total_handle_time_seconds,
          quality_score,
          transfer_flag,
          escalation_flag,
          call_completed,
          first_contact_resolved,
          productivity_score,
          utilization_percent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const result = await db.query(query, [
        clientId,
        agentId,
        callId,
        talkTime,
        holdTime,
        wrapTime,
        totalHandleTime,
        qualityScore,
        transferred,
        escalated,
        completed,
        firstContactResolved,
        productivityScore,
        utilization
      ]);

      logger.info('Call metrics collected', {
        callId,
        agentId,
        totalHandleTime,
        productivityScore
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error collecting call metrics', {
        error: error.message,
        callId
      });
      throw error;
    }
  }

  /**
   * Collect agent availability metrics
   */
  static async collectAgentAvailability(clientId, agentId, status, statusReason) {
    try {
      logger.info('Collecting agent availability', {
        agentId,
        status,
        statusReason
      });

      // Update agent status
      const query = `
        UPDATE sector_agents
        SET 
          status = $2,
          updated_at = NOW()
        WHERE id = $1 AND client_id = $3
        RETURNING *
      `;

      const result = await db.query(query, [agentId, status, clientId]);

      if (result.rows.length === 0) {
        logger.warn('Agent not found', { agentId });
        return null;
      }

      logger.info('Agent availability recorded', {
        agentId,
        status
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error collecting agent availability', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Collect queue metrics
   */
  static async collectQueueMetrics(clientId) {
    try {
      logger.info('Collecting queue metrics', { clientId });

      const query = `
        SELECT 
          COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued_calls,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_calls,
          COUNT(CASE WHEN status = 'abandoned' THEN 1 END) as abandoned_calls,
          ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)))::NUMERIC, 0) as avg_wait_seconds,
          MAX(EXTRACT(EPOCH FROM (NOW() - created_at)))::INTEGER as max_wait_seconds,
          MIN(EXTRACT(EPOCH FROM (NOW() - created_at)))::INTEGER as min_wait_seconds
        FROM calls
        WHERE client_id = $1 
          AND status IN ('queued', 'active')
          AND created_at > NOW() - INTERVAL '24 hours'
      `;

      const result = await db.query(query, [clientId]);

      logger.info('Queue metrics collected', {
        clientId,
        metrics: result.rows[0]
      });

      return result.rows[0] || {
        queuedCalls: 0,
        activeCalls: 0,
        abandonedCalls: 0,
        avgWaitSeconds: 0
      };
    } catch (error) {
      logger.error('Error collecting queue metrics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Collect system performance metrics
   */
  static async collectSystemMetrics(clientId) {
    try {
      logger.info('Collecting system metrics', { clientId });

      // Database query performance
      const startDb = Date.now();
      await db.query('SELECT 1');
      const dbTime = Date.now() - startDb;

      // API performance
      const apiQuery = `
        SELECT 
          ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)))::NUMERIC * 1000, 2) as avg_api_response_ms
        FROM agent_metrics
        WHERE client_id = $1 
          AND created_at > NOW() - INTERVAL '1 hour'
      `;

      const apiResult = await db.query(apiQuery, [clientId]);

      const metrics = {
        timestamp: new Date(),
        database: {
          responseTime: dbTime,
          status: dbTime < 100 ? 'healthy' : dbTime < 500 ? 'degraded' : 'unhealthy'
        },
        api: {
          avgResponseTime: parseFloat(apiResult.rows[0]?.avg_api_response_ms) || 0,
          status: (parseFloat(apiResult.rows[0]?.avg_api_response_ms) || 0) < 100 ? 'healthy' : 'degraded'
        }
      };

      metrics.overall = (metrics.database.status === 'healthy' && metrics.api.status === 'healthy')
        ? 'healthy'
        : 'degraded';

      logger.info('System metrics collected', {
        clientId,
        overallStatus: metrics.overall
      });

      return metrics;
    } catch (error) {
      logger.error('Error collecting system metrics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate metric values
   */
  static validateMetrics(metrics) {
    const requiredFields = ['agentId', 'callId', 'talkTime', 'holdTime', 'wrapTime'];
    const missingFields = requiredFields.filter(field => !(field in metrics));

    if (missingFields.length > 0) {
      logger.warn('Missing required metric fields', { missingFields });
      return {
        valid: false,
        errors: missingFields.map(f => `Missing: ${f}`)
      };
    }

    // Validate ranges
    const errors = [];
    if (metrics.talkTime < 0) errors.push('Talk time cannot be negative');
    if (metrics.holdTime < 0) errors.push('Hold time cannot be negative');
    if (metrics.wrapTime < 0) errors.push('Wrap time cannot be negative');
    if (metrics.qualityScore && (metrics.qualityScore < 0 || metrics.qualityScore > 5)) {
      errors.push('Quality score must be between 0 and 5');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Batch collect metrics from multiple calls
   */
  static async collectBatchMetrics(clientId, metricsArray) {
    try {
      logger.info('Batch collecting metrics', {
        clientId,
        count: metricsArray.length
      });

      const results = [];

      for (const metrics of metricsArray) {
        const validation = this.validateMetrics(metrics);
        if (!validation.valid) {
          logger.warn('Skipping invalid metrics', { errors: validation.errors });
          continue;
        }

        const collected = await this.collectCallMetrics(clientId, metrics.callId, metrics);
        if (collected) {
          results.push(collected);
        }
      }

      logger.info('Batch metrics collection complete', {
        clientId,
        collected: results.length,
        total: metricsArray.length
      });

      return results;
    } catch (error) {
      logger.error('Error batch collecting metrics', {
        error: error.message
      });
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Calculate productivity score based on handle time and quality
   * @private
   */
  static _calculateProductivityScore(handleTime, qualityScore, fcr) {
    // Base productivity on quality (60%) + efficiency (40%)
    let score = (qualityScore / 5) * 0.6; // Quality component
    
    // Efficiency: penalize very long calls, reward efficient ones
    let efficiency;
    if (handleTime < 180) { // Less than 3 minutes
      efficiency = 0.9;
    } else if (handleTime < 300) { // Less than 5 minutes
      efficiency = 0.8;
    } else if (handleTime < 600) { // Less than 10 minutes
      efficiency = 0.6;
    } else if (handleTime < 1200) { // Less than 20 minutes
      efficiency = 0.4;
    } else {
      efficiency = 0.2;
    }

    score += efficiency * 0.4; // Efficiency component

    // Bonus for FCR
    if (fcr) {
      score += 0.2;
    }

    return Math.min(5, parseFloat(score.toFixed(2)));
  }

  /**
   * Calculate agent utilization percentage
   * @private
   */
  static async _calculateAgentUtilization(agentId) {
    try {
      const query = `
        SELECT 
          ROUND(SUM(total_handle_time_seconds)::NUMERIC / 
            NULLIF(COUNT(*) * 3600, 0) * 100, 2) as utilization
        FROM agent_metrics
        WHERE agent_id = $1 
          AND created_at::DATE = CURRENT_DATE
      `;

      const result = await db.query(query, [agentId]);
      return parseFloat(result.rows[0]?.utilization) || 0;
    } catch (error) {
      logger.warn('Could not calculate utilization', { error: error.message });
      return 0;
    }
  }
}

module.exports = MetricsCollector;
