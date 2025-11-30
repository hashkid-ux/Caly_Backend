/**
 * Performance Aggregator - Track and aggregate agent & team performance metrics
 * Updates metrics daily: success rates, handling times, satisfaction scores
 * Used by routing engine for optimization
 */

const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));

class PerformanceAggregator {
  constructor() {
    this.aggregationInterval = 60 * 1000; // Run every minute
    this.isRunning = false;
    this.lastRun = null;
  }

  /**
   * Start performance aggregation service
   */
  async start() {
    if (this.isRunning) {
      logger.warn('PerformanceAggregator already running');
      return;
    }

    this.isRunning = true;
    logger.info('PerformanceAggregator started');

    // Run immediately on startup
    await this.aggregateDaily();

    // Schedule regular aggregation
    this.interval = setInterval(async () => {
      try {
        await this.aggregateDaily();
      } catch (error) {
        logger.error('Error in scheduled aggregation', { error: error.message });
      }
    }, this.aggregationInterval);
  }

  /**
   * Stop the aggregation service
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    this.isRunning = false;
    logger.info('PerformanceAggregator stopped');
  }

  /**
   * Aggregate call data into daily metrics
   */
  async aggregateDaily() {
    const startTime = Date.now();

    try {
      // Get today's calls that haven't been aggregated
      const callsResult = await db.query(
        `SELECT * FROM calls 
         WHERE DATE(created_at) = CURRENT_DATE 
         AND (agent_type IS NOT NULL OR team_member_id IS NOT NULL)
         ORDER BY created_at DESC`
      );

      if (!callsResult.rows.length) {
        logger.debug('No calls to aggregate');
        return;
      }

      // Group by agent/team member
      const agentMetrics = {};
      const teamMetrics = {};

      callsResult.rows.forEach(call => {
        const isSuccess = call.resolved === true && call.customer_satisfaction >= 4;
        const callDuration = call.duration_seconds || 0;

        // Agent metrics
        if (call.agent_type) {
          const agentKey = `${call.client_id}_${call.agent_type}`;
          if (!agentMetrics[agentKey]) {
            agentMetrics[agentKey] = {
              client_id: call.client_id,
              agent_type: call.agent_type,
              calls_handled: 0,
              calls_successful: 0,
              calls_failed: 0,
              total_duration: 0,
              satisfaction_scores: [],
              escalations: 0
            };
          }

          agentMetrics[agentKey].calls_handled++;
          if (isSuccess) {
            agentMetrics[agentKey].calls_successful++;
          } else {
            agentMetrics[agentKey].calls_failed++;
          }
          agentMetrics[agentKey].total_duration += callDuration;
          if (call.customer_satisfaction) {
            agentMetrics[agentKey].satisfaction_scores.push(call.customer_satisfaction);
          }
          if (call.escalated === true) {
            agentMetrics[agentKey].escalations++;
          }
        }

        // Team member metrics
        if (call.team_member_id) {
          const teamMemberKey = `${call.client_id}_${call.team_member_id}`;
          if (!teamMetrics[teamMemberKey]) {
            teamMetrics[teamMemberKey] = {
              client_id: call.client_id,
              team_member_id: call.team_member_id,
              team_id: call.team_id,
              calls_handled: 0,
              calls_completed: 0,
              calls_escalated: 0,
              total_duration: 0,
              satisfaction_scores: [],
              agents_used: new Set()
            };
          }

          teamMetrics[teamMemberKey].calls_handled++;
          if (call.resolved === true) {
            teamMetrics[teamMemberKey].calls_completed++;
          }
          if (call.escalated === true) {
            teamMetrics[teamMemberKey].calls_escalated++;
          }
          teamMetrics[teamMemberKey].total_duration += callDuration;
          if (call.customer_satisfaction) {
            teamMetrics[teamMemberKey].satisfaction_scores.push(call.customer_satisfaction);
          }
          if (call.agent_type) {
            teamMetrics[teamMemberKey].agents_used.add(call.agent_type);
          }
        }
      });

      // Batch insert agent metrics
      await this.upsertAgentMetrics(agentMetrics);

      // Batch insert team metrics
      await this.upsertTeamMetrics(teamMetrics);

      // Update sector_agents success rates
      await this.updateAgentSuccessRates();

      const duration = Date.now() - startTime;
      logger.info('Daily aggregation complete', {
        calls_processed: callsResult.rows.length,
        duration_ms: duration,
        agents: Object.keys(agentMetrics).length,
        teams: Object.keys(teamMetrics).length
      });

      this.lastRun = new Date();

    } catch (error) {
      logger.error('Error during daily aggregation', { error: error.message });
      throw error;
    }
  }

  /**
   * Upsert agent metrics into agent_metrics_v2 table
   */
  async upsertAgentMetrics(agentMetrics) {
    const values = [];
    let paramCount = 1;

    Object.values(agentMetrics).forEach(metric => {
      const avgSatisfaction = metric.satisfaction_scores.length > 0
        ? (metric.satisfaction_scores.reduce((a, b) => a + b, 0) / metric.satisfaction_scores.length)
        : null;

      const avgHandlingTime = metric.calls_handled > 0
        ? Math.round(metric.total_duration / metric.calls_handled)
        : null;

      const successRate = metric.calls_handled > 0
        ? (metric.calls_successful / metric.calls_handled)
        : 0;

      values.push(
        `($${paramCount}, $${paramCount + 1}, $${paramCount + 2}, $${paramCount + 3}, CURRENT_DATE, ` +
        `$${paramCount + 4}, $${paramCount + 5}, $${paramCount + 6}, $${paramCount + 7}, $${paramCount + 8})`
      );

      paramCount += 9;
    });

    if (values.length === 0) {
      return;
    }

    let query = `INSERT INTO agent_metrics_v2 
      (client_id, team_member_id, agent_type, date, calls_handled, calls_successful, calls_failed, 
       avg_satisfaction_score, avg_handling_time_seconds)
    VALUES `;

    query += values.join(', ');

    query += ` ON CONFLICT (client_id, agent_type, date) DO UPDATE SET
      calls_handled = calls_handled + EXCLUDED.calls_handled,
      calls_successful = calls_successful + EXCLUDED.calls_successful,
      calls_failed = calls_failed + EXCLUDED.calls_failed,
      avg_satisfaction_score = EXCLUDED.avg_satisfaction_score,
      avg_handling_time_seconds = EXCLUDED.avg_handling_time_seconds,
      updated_at = NOW()`;

    const params = [];
    Object.values(agentMetrics).forEach(metric => {
      const avgSatisfaction = metric.satisfaction_scores.length > 0
        ? (metric.satisfaction_scores.reduce((a, b) => a + b, 0) / metric.satisfaction_scores.length)
        : null;

      const avgHandlingTime = metric.calls_handled > 0
        ? Math.round(metric.total_duration / metric.calls_handled)
        : null;

      params.push(
        metric.client_id,
        null, // team_member_id (handled separately)
        metric.agent_type,
        metric.calls_handled,
        metric.calls_successful,
        metric.calls_failed,
        avgSatisfaction,
        avgHandlingTime
      );
    });

    try {
      await db.query(query, params);
    } catch (error) {
      logger.warn('Error upserting agent metrics', { error: error.message });
    }
  }

  /**
   * Upsert team performance metrics
   */
  async upsertTeamMetrics(teamMetrics) {
    const values = [];
    let paramCount = 1;

    Object.values(teamMetrics).forEach(metric => {
      const avgSatisfaction = metric.satisfaction_scores.length > 0
        ? (metric.satisfaction_scores.reduce((a, b) => a + b, 0) / metric.satisfaction_scores.length)
        : null;

      const resolutionRate = metric.calls_handled > 0
        ? (metric.calls_completed / metric.calls_handled)
        : 0;

      values.push(
        `($${paramCount}, $${paramCount + 1}, $${paramCount + 2}, CURRENT_DATE, ` +
        `$${paramCount + 3}, $${paramCount + 4}, $${paramCount + 5}, ` +
        `$${paramCount + 6}, $${paramCount + 7})`
      );

      paramCount += 8;
    });

    if (values.length === 0) {
      return;
    }

    let query = `INSERT INTO team_performance 
      (team_id, team_member_id, client_id, date, calls_handled, calls_completed, calls_escalated, 
       avg_satisfaction_score, resolution_rate)
    VALUES `;

    query += values.join(', ');

    query += ` ON CONFLICT (team_id, team_member_id, date) DO UPDATE SET
      calls_handled = calls_handled + EXCLUDED.calls_handled,
      calls_completed = calls_completed + EXCLUDED.calls_completed,
      calls_escalated = calls_escalated + EXCLUDED.calls_escalated,
      avg_satisfaction_score = EXCLUDED.avg_satisfaction_score,
      resolution_rate = EXCLUDED.resolution_rate,
      updated_at = NOW()`;

    const params = [];
    Object.values(teamMetrics).forEach(metric => {
      const avgSatisfaction = metric.satisfaction_scores.length > 0
        ? (metric.satisfaction_scores.reduce((a, b) => a + b, 0) / metric.satisfaction_scores.length)
        : null;

      const resolutionRate = metric.calls_handled > 0
        ? (metric.calls_completed / metric.calls_handled)
        : 0;

      params.push(
        metric.team_id,
        metric.team_member_id,
        metric.client_id,
        metric.calls_handled,
        metric.calls_completed,
        metric.calls_escalated,
        avgSatisfaction,
        resolutionRate
      );
    });

    try {
      await db.query(query, params);
    } catch (error) {
      logger.warn('Error upserting team metrics', { error: error.message });
    }
  }

  /**
   * Update sector_agents success_rate and avg_handling_time based on recent calls
   */
  async updateAgentSuccessRates() {
    try {
      // Check if agent_metrics_v2 table exists first
      const tableCheck = await db.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'agent_metrics_v2'
        )`
      );

      if (!tableCheck.rows[0].exists) {
        logger.debug('agent_metrics_v2 table not found, skipping success rate update');
        return;
      }

      // Check if sector_agents has success_rate column
      const colCheck = await db.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'sector_agents' AND column_name = 'success_rate'
        )`
      );

      if (!colCheck.rows[0].exists) {
        logger.debug('success_rate column not found in sector_agents, skipping update');
        return;
      }

      // Update from agent_metrics_v2 last 7 days
      await db.query(
        `UPDATE sector_agents sa SET
          success_rate = (
            SELECT COALESCE(AVG(calls_successful::float / NULLIF(calls_handled, 0)), 0.8)
            FROM agent_metrics_v2 am
            WHERE am.agent_type = sa.agent_type 
            AND am.date >= CURRENT_DATE - INTERVAL '7 days'
          ),
          avg_handling_time = (
            SELECT COALESCE(AVG(avg_handling_time_seconds), 300)
            FROM agent_metrics_v2 am
            WHERE am.agent_type = sa.agent_type
            AND am.date >= CURRENT_DATE - INTERVAL '7 days'
          )
        WHERE enabled = true`
      );

      logger.debug('Agent success rates updated');

    } catch (error) {
      logger.warn('Error updating agent success rates', { error: error.message });
    }
  }

  /**
   * Get team member performance trends
   */
  async getTeamMemberTrends(teamMemberId, days = 30) {
    try {
      const result = await db.query(
        `SELECT date, calls_handled, calls_completed, calls_escalated, 
                avg_satisfaction_score, resolution_rate
         FROM team_performance
         WHERE team_member_id = $1 AND date >= CURRENT_DATE - INTERVAL '${days} days'
         ORDER BY date DESC`,
        [teamMemberId]
      );

      return result.rows || [];

    } catch (error) {
      logger.error('Error getting team member trends', { error: error.message });
      return [];
    }
  }

  /**
   * Get agent performance comparison
   */
  async getAgentComparison(clientId, days = 30) {
    try {
      const result = await db.query(
        `SELECT 
          agent_type,
          SUM(calls_handled) as total_calls,
          SUM(calls_successful) as successful_calls,
          ROUND(AVG(avg_satisfaction_score)::numeric, 2) as avg_satisfaction,
          ROUND(AVG(avg_handling_time_seconds)::numeric, 0) as avg_duration
         FROM agent_metrics_v2
         WHERE client_id = $1 AND date >= CURRENT_DATE - INTERVAL '${days} days'
         GROUP BY agent_type
         ORDER BY successful_calls DESC`,
        [clientId]
      );

      return result.rows || [];

    } catch (error) {
      logger.error('Error getting agent comparison', { error: error.message });
      return [];
    }
  }

  /**
   * Get aggregator status
   */
  getStatus() {
    return {
      running: this.isRunning,
      last_run: this.lastRun,
      interval_ms: this.aggregationInterval
    };
  }
}

// Export singleton
module.exports = new PerformanceAggregator();
