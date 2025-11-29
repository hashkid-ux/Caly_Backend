/**
 * Analytics Performance Endpoints
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Endpoints for agent performance, sector comparison, and trending analysis
 */

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const { authMiddleware } = require('../auth/authMiddleware');
const logger = require('../utils/logger');

// ============================================================================
// 1. AGENT PERFORMANCE ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/performance/agents
 * Get performance metrics for all agents in client
 * Query params: 
 *   - agentId (optional): specific agent
 *   - startDate: ISO date
 *   - endDate: ISO date
 *   - metric: 'quality', 'efficiency', 'satisfaction', 'all'
 */
router.get('/performance/agents', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { agentId, startDate, endDate, metric = 'all' } = req.query;

    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required'
      });
    }

    let query = `
      SELECT 
        sa.id as agent_id,
        sa.agent_name,
        sa.agent_type,
        sa.sector_key,
        COUNT(am.id) as total_calls,
        ROUND(AVG(am.quality_score)::NUMERIC, 2) as avg_quality_score,
        ROUND(AVG(am.total_handle_time_seconds)::NUMERIC, 0) as avg_handle_time_seconds,
        ROUND(AVG(am.utilization_percent)::NUMERIC, 2) as avg_utilization_percent,
        SUM(CASE WHEN am.first_contact_resolved THEN 1 ELSE 0 END)::INT as fcr_count,
        ROUND(SUM(CASE WHEN am.first_contact_resolved THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100, 2) as fcr_percent,
        ROUND(AVG(cs.csat_score)::NUMERIC, 2) as avg_csat_score,
        ROUND(AVG(cs.nps_score)::NUMERIC, 2) as avg_nps_score,
        ROUND(AVG(cqs.overall_quality_score)::NUMERIC, 2) as review_quality_score
      FROM sector_agents sa
      LEFT JOIN agent_metrics am ON sa.id = am.agent_id 
        AND am.client_id = $1 
        AND am.created_at::DATE BETWEEN $2 AND $3
      LEFT JOIN customer_satisfaction cs ON am.call_id = cs.call_id
      LEFT JOIN call_quality_scores cqs ON am.call_id = cqs.call_id
      WHERE sa.client_id = $1
    `;

    const params = [userClientId, startDate, endDate];

    if (agentId) {
      query += ' AND sa.id = $4';
      params.push(agentId);
    }

    query += ' GROUP BY sa.id, sa.agent_name, sa.agent_type, sa.sector_key';
    query += ' ORDER BY total_calls DESC';

    const result = await db.query(query, params);

    logger.info('Agent performance retrieved', {
      userId: req.user.id,
      clientId: userClientId,
      agentCount: result.rows.length,
      dateRange: `${startDate} to ${endDate}`
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    logger.error('Error fetching agent performance', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch agent performance' });
  }
});

/**
 * GET /api/analytics/performance/agent/:agentId/detailed
 * Get detailed performance breakdown for specific agent
 */
router.get('/performance/agent/:agentId/detailed', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { agentId } = req.params;
    const { startDate, endDate } = req.query;

    // Verify agent belongs to client
    const agentCheck = await db.query(
      'SELECT id FROM sector_agents WHERE id = $1 AND client_id = $2',
      [agentId, userClientId]
    );

    if (agentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const query = `
      SELECT 
        am.id,
        am.call_id,
        c.call_duration,
        c.caller_name,
        am.quality_score,
        am.total_handle_time_seconds,
        am.first_contact_resolved,
        am.transfer_flag,
        am.escalation_flag,
        cs.csat_score,
        cs.nps_score,
        cqs.overall_quality_score,
        am.created_at
      FROM agent_metrics am
      JOIN calls c ON am.call_id = c.id
      LEFT JOIN customer_satisfaction cs ON am.call_id = cs.call_id
      LEFT JOIN call_quality_scores cqs ON am.call_id = cqs.call_id
      WHERE am.agent_id = $1 
        AND am.client_id = $2
        AND am.created_at::DATE BETWEEN $3 AND $4
      ORDER BY am.created_at DESC
      LIMIT 1000
    `;

    const result = await db.query(query, [agentId, userClientId, startDate, endDate]);

    logger.info('Agent detailed performance retrieved', {
      agentId,
      recordCount: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching detailed agent performance', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch detailed performance' });
  }
});

// ============================================================================
// 2. SECTOR PERFORMANCE ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/performance/sectors
 * Compare performance across sectors
 */
router.get('/performance/sectors', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required'
      });
    }

    const query = `
      SELECT 
        sa.sector_key,
        COUNT(DISTINCT sa.id) as agent_count,
        COUNT(am.id) as total_calls,
        ROUND(AVG(am.quality_score)::NUMERIC, 2) as avg_quality,
        ROUND(AVG(am.total_handle_time_seconds)::NUMERIC, 0) as avg_handle_time,
        ROUND(AVG(am.utilization_percent)::NUMERIC, 2) as avg_utilization,
        SUM(CASE WHEN am.first_contact_resolved THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(am.id), 0) * 100 as fcr_percent,
        ROUND(AVG(cs.csat_score)::NUMERIC, 2) as avg_csat
      FROM sector_agents sa
      LEFT JOIN agent_metrics am ON sa.id = am.agent_id 
        AND am.client_id = $1 
        AND am.created_at::DATE BETWEEN $2 AND $3
      LEFT JOIN customer_satisfaction cs ON am.call_id = cs.call_id
      WHERE sa.client_id = $1
      GROUP BY sa.sector_key
      ORDER BY total_calls DESC
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('Sector performance retrieved', {
      sectorCount: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching sector performance', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch sector performance' });
  }
});

// ============================================================================
// 3. TOP PERFORMERS ENDPOINT
// ============================================================================

/**
 * GET /api/analytics/performance/top-performers
 * Get top performing agents
 * Query params: limit (default 10), metric ('quality', 'efficiency', 'satisfaction')
 */
router.get('/performance/top-performers', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { limit = 10, metric = 'quality', startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required'
      });
    }

    let orderByClause;
    switch (metric) {
      case 'quality':
        orderByClause = 'avg_quality_score DESC';
        break;
      case 'efficiency':
        orderByClause = 'avg_handle_time_seconds ASC';
        break;
      case 'satisfaction':
        orderByClause = 'avg_csat_score DESC';
        break;
      default:
        orderByClause = 'total_calls DESC';
    }

    const query = `
      SELECT 
        sa.id as agent_id,
        sa.agent_name,
        sa.agent_type,
        sa.sector_key,
        COUNT(am.id) as total_calls,
        ROUND(AVG(am.quality_score)::NUMERIC, 2) as avg_quality_score,
        ROUND(AVG(am.total_handle_time_seconds)::NUMERIC, 0) as avg_handle_time_seconds,
        ROUND(AVG(cs.csat_score)::NUMERIC, 2) as avg_csat_score,
        ROUND(AVG(cs.nps_score)::NUMERIC, 2) as avg_nps_score
      FROM sector_agents sa
      LEFT JOIN agent_metrics am ON sa.id = am.agent_id 
        AND am.client_id = $1 
        AND am.created_at::DATE BETWEEN $2 AND $3
      LEFT JOIN customer_satisfaction cs ON am.call_id = cs.call_id
      WHERE sa.client_id = $1
      GROUP BY sa.id, sa.agent_name, sa.agent_type, sa.sector_key
      HAVING COUNT(am.id) > 0
      ORDER BY ${orderByClause}
      LIMIT $4
    `;

    const result = await db.query(query, [userClientId, startDate, endDate, parseInt(limit)]);

    logger.info('Top performers retrieved', {
      limit,
      metric,
      count: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      metric
    });
  } catch (error) {
    logger.error('Error fetching top performers', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch top performers' });
  }
});

// ============================================================================
// 4. PERFORMANCE TRENDS ENDPOINT
// ============================================================================

/**
 * GET /api/analytics/performance/trends
 * Get performance trends over time
 * Query params: agentId (optional), sectorKey (optional), aggregation ('hourly', 'daily', 'weekly')
 */
router.get('/performance/trends', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { agentId, sectorKey, aggregation = 'daily', startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required'
      });
    }

    let query = `
      SELECT 
        trend_date,
        aggregation_level,
        COUNT(*) as data_points,
        AVG(total_calls) as avg_calls,
        AVG(avg_quality_score) as avg_quality,
        AVG(avg_handle_time_seconds) as avg_handle_time,
        AVG(first_contact_resolution_percent) as avg_fcr,
        AVG(avg_csat_score) as avg_csat,
        SUM(total_revenue) as total_revenue,
        SUM(total_cost) as total_cost
      FROM performance_trends
      WHERE client_id = $1 
        AND aggregation_level = $2
        AND trend_date BETWEEN $3 AND $4
    `;

    const params = [userClientId, aggregation, startDate, endDate];

    if (agentId) {
      query += ' AND agent_id = $5';
      params.push(agentId);
    }

    if (sectorKey) {
      query += ` AND sector_key = $${params.length + 1}`;
      params.push(sectorKey);
    }

    query += ` GROUP BY trend_date, aggregation_level
              ORDER BY trend_date ASC`;

    const result = await db.query(query, params);

    logger.info('Performance trends retrieved', {
      aggregation,
      dataPoints: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      aggregation
    });
  } catch (error) {
    logger.error('Error fetching performance trends', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch performance trends' });
  }
});

// ============================================================================
// 5. PERFORMANCE SUMMARY ENDPOINT
// ============================================================================

/**
 * GET /api/analytics/performance/summary
 * Get overall performance summary for client
 */
router.get('/performance/summary', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required'
      });
    }

    const query = `
      SELECT 
        COUNT(DISTINCT am.agent_id) as total_agents,
        COUNT(am.id) as total_calls,
        ROUND(AVG(am.quality_score)::NUMERIC, 2) as avg_quality_score,
        ROUND(AVG(am.total_handle_time_seconds)::NUMERIC, 0) as avg_handle_time_seconds,
        ROUND(AVG(am.utilization_percent)::NUMERIC, 2) as avg_utilization_percent,
        SUM(CASE WHEN am.first_contact_resolved THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(am.id), 0) * 100 as fcr_percent,
        SUM(CASE WHEN am.transfer_flag THEN 1 ELSE 0 END)::INT as transfer_count,
        SUM(CASE WHEN am.escalation_flag THEN 1 ELSE 0 END)::INT as escalation_count,
        ROUND(AVG(cs.csat_score)::NUMERIC, 2) as avg_csat_score,
        ROUND(AVG(cs.nps_score)::NUMERIC, 2) as avg_nps_score
      FROM agent_metrics am
      LEFT JOIN customer_satisfaction cs ON am.call_id = cs.call_id
      WHERE am.client_id = $1 
        AND am.created_at::DATE BETWEEN $2 AND $3
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('Performance summary retrieved', {
      dateRange: `${startDate} to ${endDate}`
    });

    res.json({
      success: true,
      data: result.rows[0] || {}
    });
  } catch (error) {
    logger.error('Error fetching performance summary', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch performance summary' });
  }
});

// ============================================================================
// ERROR HANDLERS
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Analytics performance route error', {
    error: error.message,
    path: req.path
  });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
