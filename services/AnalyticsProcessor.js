/**
 * Analytics Processor Service
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Aggregates metrics, calculates KPIs, and maintains performance trends
 */

const db = require('../db/postgres');
const logger = require('../utils/logger');

/**
 * AnalyticsProcessor Service
 * Handles metric aggregation and KPI calculations
 */
class AnalyticsProcessor {
  /**
   * Process and aggregate metrics for time period
   * @param {string} clientId - Client ID
   * @param {string} aggregationLevel - 'hourly', 'daily', 'weekly', 'monthly'
   * @param {Date} periodStart - Start of period
   * @param {Date} periodEnd - End of period
   */
  static async processMetrics(clientId, aggregationLevel = 'daily', periodStart, periodEnd) {
    try {
      logger.info('Processing analytics metrics', {
        clientId,
        aggregationLevel,
        dateRange: `${periodStart} to ${periodEnd}`
      });

      const metrics = await this._aggregateMetrics(clientId, aggregationLevel, periodStart, periodEnd);
      
      if (metrics.length === 0) {
        logger.warn('No metrics to process', { clientId, aggregationLevel });
        return { processed: 0 };
      }

      // Save aggregated metrics to performance_trends
      for (const metric of metrics) {
        await this._saveTrend(clientId, metric, aggregationLevel);
      }

      logger.info('Metrics processing complete', {
        clientId,
        recordsProcessed: metrics.length
      });

      return { processed: metrics.length };
    } catch (error) {
      logger.error('Error processing analytics metrics', {
        error: error.message,
        clientId
      });
      throw error;
    }
  }

  /**
   * Aggregate raw metrics by time period and agent
   */
  static async _aggregateMetrics(clientId, aggregationLevel, periodStart, periodEnd) {
    try {
      // Determine time grouping
      let dateGroup;
      switch (aggregationLevel) {
        case 'hourly':
          dateGroup = "DATE_TRUNC('hour', created_at)";
          break;
        case 'daily':
          dateGroup = "DATE_TRUNC('day', created_at)";
          break;
        case 'weekly':
          dateGroup = "DATE_TRUNC('week', created_at)";
          break;
        case 'monthly':
          dateGroup = "DATE_TRUNC('month', created_at)";
          break;
        default:
          dateGroup = "DATE_TRUNC('day', created_at)";
      }

      const query = `
        SELECT 
          ${dateGroup} as period_start,
          agent_id,
          sector_key,
          COUNT(*) as total_calls,
          SUM(CASE WHEN call_completed THEN 1 ELSE 0 END) as completed_calls,
          COUNT(*) - SUM(CASE WHEN call_completed THEN 1 ELSE 0 END) as abandoned_calls,
          SUM(CASE WHEN transfer_flag THEN 1 ELSE 0 END) as transferred_calls,
          SUM(CASE WHEN escalation_flag THEN 1 ELSE 0 END) as escalated_calls,
          ROUND(AVG(total_handle_time_seconds)::NUMERIC, 0) as avg_handle_time,
          ROUND(AVG(talk_time_seconds)::NUMERIC, 0) as avg_talk_time,
          ROUND(AVG(hold_time_seconds)::NUMERIC, 0) as avg_hold_time,
          ROUND(AVG(wrap_time_seconds)::NUMERIC, 0) as avg_wrap_time,
          ROUND(AVG(quality_score)::NUMERIC, 2) as avg_quality,
          ROUND(AVG(productivity_score)::NUMERIC, 2) as avg_productivity,
          ROUND(AVG(utilization_percent)::NUMERIC, 2) as avg_utilization,
          SUM(CASE WHEN first_contact_resolved THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100 as fcr_percent
        FROM agent_metrics
        WHERE client_id = $1
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY ${dateGroup}, agent_id, sector_key
        ORDER BY period_start DESC
      `;

      const result = await db.query(query, [clientId, periodStart, periodEnd]);
      return result.rows;
    } catch (error) {
      logger.error('Error aggregating metrics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Save aggregated metrics to performance_trends table
   */
  static async _saveTrend(clientId, metric, aggregationLevel) {
    try {
      const trendDate = new Date(metric.period_start);

      const query = `
        INSERT INTO performance_trends (
          client_id,
          agent_id,
          sector_key,
          trend_date,
          hour_of_day,
          day_of_week,
          week_of_year,
          month,
          year,
          aggregation_level,
          total_calls,
          completed_calls,
          abandoned_calls,
          transferred_calls,
          escalated_calls,
          avg_handle_time_seconds,
          avg_talk_time_seconds,
          avg_hold_time_seconds,
          avg_wrap_time_seconds,
          avg_quality_score,
          productivity_score,
          agent_availability_percent,
          utilization_percent,
          first_contact_resolution_percent
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24
        )
        ON CONFLICT DO NOTHING
      `;

      const params = [
        clientId,
        metric.agent_id,
        metric.sector_key,
        trendDate,
        trendDate.getHours(),
        trendDate.getDay(),
        Math.ceil((trendDate.getDate() + new Date(trendDate.getFullYear(), trendDate.getMonth(), 1).getDay()) / 7),
        trendDate.getMonth() + 1,
        trendDate.getFullYear(),
        aggregationLevel,
        metric.total_calls,
        metric.completed_calls,
        metric.abandoned_calls,
        metric.transferred_calls,
        metric.escalated_calls,
        metric.avg_handle_time,
        metric.avg_talk_time,
        metric.avg_hold_time,
        metric.avg_wrap_time,
        metric.avg_quality,
        metric.avg_productivity,
        95.00, // Default availability
        metric.avg_utilization,
        metric.fcr_percent
      ];

      await db.query(query, params);
    } catch (error) {
      logger.error('Error saving trend', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate KPIs from raw metrics
   */
  static async calculateKPIs(clientId, startDate, endDate) {
    try {
      logger.info('Calculating KPIs', {
        clientId,
        dateRange: `${startDate} to ${endDate}`
      });

      const query = `
        SELECT 
          COUNT(DISTINCT agent_id) as total_agents,
          COUNT(*) as total_calls,
          COUNT(CASE WHEN first_contact_resolved THEN 1 END) as fcr_calls,
          COUNT(CASE WHEN call_completed THEN 1 END) as completed_calls,
          ROUND(AVG(quality_score)::NUMERIC, 2) as avg_quality,
          ROUND(AVG(total_handle_time_seconds)::NUMERIC, 0) as avg_handle_time,
          ROUND(AVG(utilization_percent)::NUMERIC, 2) as avg_utilization
        FROM agent_metrics
        WHERE client_id = $1
          AND created_at::DATE BETWEEN $2 AND $3
      `;

      const result = await db.query(query, [clientId, startDate, endDate]);
      const row = result.rows[0];

      const kpis = {
        totalAgents: parseInt(row.total_agents),
        totalCalls: parseInt(row.total_calls),
        firstContactResolutionPercent: row.total_calls > 0 
          ? parseFloat(((row.fcr_calls / row.total_calls) * 100).toFixed(2))
          : 0,
        completionRate: row.total_calls > 0
          ? parseFloat(((row.completed_calls / row.total_calls) * 100).toFixed(2))
          : 0,
        averageQualityScore: parseFloat(row.avg_quality) || 0,
        averageHandleTime: parseInt(row.avg_handle_time) || 0,
        averageUtilization: parseFloat(row.avg_utilization) || 0
      };

      logger.info('KPIs calculated', { clientId, kpis });
      return kpis;
    } catch (error) {
      logger.error('Error calculating KPIs', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Refresh materialized views
   */
  static async refreshMaterializedViews() {
    try {
      logger.info('Refreshing materialized views');

      // Refresh daily performance summary
      await db.query('REFRESH MATERIALIZED VIEW daily_performance_summary');
      logger.info('Refreshed: daily_performance_summary');

      // Refresh sector performance summary
      await db.query('REFRESH MATERIALIZED VIEW sector_performance_summary');
      logger.info('Refreshed: sector_performance_summary');

      return { success: true, viewsRefreshed: 2 };
    } catch (error) {
      logger.error('Error refreshing materialized views', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get dashboard summary data
   */
  static async getDashboardSummary(clientId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get current period KPIs
      const kpis = await this.calculateKPIs(
        clientId,
        startDate.toISOString().split('T')[0],
        new Date().toISOString().split('T')[0]
      );

      // Get trends
      const trendsQuery = `
        SELECT 
          trend_date,
          AVG(total_calls) as avg_calls,
          AVG(avg_quality_score) as avg_quality,
          AVG(first_contact_resolution_percent) as avg_fcr
        FROM performance_trends
        WHERE client_id = $1 
          AND aggregation_level = 'daily'
          AND trend_date >= $2
        GROUP BY trend_date
        ORDER BY trend_date DESC
        LIMIT ${days}
      `;

      const trendsResult = await db.query(trendsQuery, [
        clientId,
        startDate
      ]);

      return {
        kpis,
        trends: trendsResult.rows,
        dateRange: {
          startDate,
          endDate: new Date(),
          days
        }
      };
    } catch (error) {
      logger.error('Error getting dashboard summary', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Detect anomalies in metrics
   */
  static async detectAnomalies(clientId) {
    try {
      logger.info('Detecting anomalies', { clientId });

      // Get current metrics
      const currentQuery = `
        SELECT 
          agent_id,
          AVG(quality_score) as current_quality,
          AVG(total_handle_time_seconds) as current_handle_time,
          AVG(utilization_percent) as current_utilization
        FROM agent_metrics
        WHERE client_id = $1 
          AND created_at > NOW() - INTERVAL '1 hour'
        GROUP BY agent_id
      `;

      const currentResult = await db.query(currentQuery, [clientId]);

      // Get historical baseline (past 7 days average)
      const baselineQuery = `
        SELECT 
          agent_id,
          AVG(avg_quality_score) as baseline_quality,
          AVG(avg_handle_time_seconds) as baseline_handle_time,
          AVG(utilization_percent) as baseline_utilization
        FROM performance_trends
        WHERE client_id = $1 
          AND aggregation_level = 'daily'
          AND trend_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY agent_id
      `;

      const baselineResult = await db.query(baselineQuery, [clientId]);

      const anomalies = [];

      for (const current of currentResult.rows) {
        const baseline = baselineResult.rows.find(b => b.agent_id === current.agent_id);
        
        if (!baseline) continue;

        // Check for quality drop > 20%
        if (current.current_quality < baseline.baseline_quality * 0.8) {
          anomalies.push({
            agentId: current.agent_id,
            type: 'Quality',
            severity: 'High',
            metric: 'Quality Score',
            expectedValue: baseline.baseline_quality,
            actualValue: current.current_quality
          });
        }

        // Check for handle time increase > 25%
        if (current.current_handle_time > baseline.baseline_handle_time * 1.25) {
          anomalies.push({
            agentId: current.agent_id,
            type: 'Performance',
            severity: 'Medium',
            metric: 'Handle Time',
            expectedValue: baseline.baseline_handle_time,
            actualValue: current.current_handle_time
          });
        }
      }

      logger.info('Anomalies detected', {
        clientId,
        count: anomalies.length
      });

      return anomalies;
    } catch (error) {
      logger.error('Error detecting anomalies', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = AnalyticsProcessor;
