/**
 * Real-time Metrics Endpoints
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Endpoints for live metrics, agent status, and queue monitoring
 */

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const { authMiddleware } = require('../auth/authMiddleware');
const logger = require('../utils/logger');

// ============================================================================
// 1. LIVE METRICS ENDPOINTS
// ============================================================================

/**
 * GET /api/metrics/live
 * Get current live metrics for client
 */
router.get('/live', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;

    // Get active calls
    const activeCalls = await db.query(`
      SELECT COUNT(*) as total
      FROM calls
      WHERE client_id = $1 
        AND status = 'active'
    `, [userClientId]);

    // Get queued calls
    const queuedCalls = await db.query(`
      SELECT COUNT(*) as total
      FROM calls
      WHERE client_id = $1 
        AND status = 'queued'
    `, [userClientId]);

    // Get available agents
    const availableAgents = await db.query(`
      SELECT COUNT(*) as total
      FROM sector_agents
      WHERE client_id = $1 
        AND enabled = true
        AND status = 'available'
    `, [userClientId]);

    // Get busy agents
    const busyAgents = await db.query(`
      SELECT COUNT(*) as total
      FROM sector_agents
      WHERE client_id = $1 
        AND enabled = true
        AND status = 'busy'
    `, [userClientId]);

    // Get recent metrics
    const recentMetrics = await db.query(`
      SELECT 
        ROUND(AVG(quality_score)::NUMERIC, 2) as avg_quality,
        ROUND(AVG(total_handle_time_seconds)::NUMERIC, 0) as avg_handle_time,
        COUNT(*) as calls_processed
      FROM agent_metrics
      WHERE client_id = $1 
        AND created_at > NOW() - INTERVAL '1 hour'
    `, [userClientId]);

    const metrics = {
      timestamp: new Date(),
      activeCalls: parseInt(activeCalls.rows[0].total),
      queuedCalls: parseInt(queuedCalls.rows[0].total),
      agentStatus: {
        available: parseInt(availableAgents.rows[0].total),
        busy: parseInt(busyAgents.rows[0].total),
        total: parseInt(availableAgents.rows[0].total) + parseInt(busyAgents.rows[0].total)
      },
      recentMetrics: recentMetrics.rows[0]
    };

    logger.info('Live metrics retrieved', {
      clientId: userClientId,
      activeCalls: metrics.activeCalls
    });

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Error fetching live metrics', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch live metrics' });
  }
});

// ============================================================================
// 2. AGENT STATUS ENDPOINTS
// ============================================================================

/**
 * GET /api/metrics/agents/status
 * Get status of all agents
 */
router.get('/agents/status', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;

    const query = `
      SELECT 
        sa.id,
        sa.agent_name,
        sa.agent_type,
        sa.sector_key,
        sa.status,
        sa.enabled,
        COUNT(am.id) FILTER (WHERE am.created_at > NOW() - INTERVAL '1 hour') as calls_last_hour,
        ROUND(AVG(am.quality_score) FILTER (WHERE am.created_at > NOW() - INTERVAL '1 hour')::NUMERIC, 2) as avg_quality_hour,
        ROUND(AVG(am.total_handle_time_seconds) FILTER (WHERE am.created_at > NOW() - INTERVAL '1 hour')::NUMERIC, 0) as avg_handle_time_hour,
        MAX(am.created_at) as last_call_time
      FROM sector_agents sa
      LEFT JOIN agent_metrics am ON sa.id = am.agent_id
      WHERE sa.client_id = $1
      GROUP BY sa.id, sa.agent_name, sa.agent_type, sa.sector_key, sa.status, sa.enabled
      ORDER BY sa.status DESC, sa.agent_name ASC
    `;

    const result = await db.query(query, [userClientId]);

    logger.info('Agent status retrieved', {
      agentCount: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching agent status', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch agent status' });
  }
});

/**
 * GET /api/metrics/agents/:agentId/status
 * Get specific agent status
 */
router.get('/agents/:agentId/status', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { agentId } = req.params;

    const query = `
      SELECT 
        sa.id,
        sa.agent_name,
        sa.agent_type,
        sa.sector_key,
        sa.status,
        sa.enabled,
        sa.created_at,
        COUNT(am.id) as total_calls,
        COUNT(am.id) FILTER (WHERE am.created_at::DATE = CURRENT_DATE) as calls_today,
        ROUND(AVG(am.quality_score)::NUMERIC, 2) as avg_quality,
        ROUND(AVG(am.total_handle_time_seconds)::NUMERIC, 0) as avg_handle_time,
        SUM(CASE WHEN am.first_contact_resolved THEN 1 ELSE 0 END) as fcr_count,
        MAX(am.created_at) as last_call_time
      FROM sector_agents sa
      LEFT JOIN agent_metrics am ON sa.id = am.agent_id
      WHERE sa.id = $1 AND sa.client_id = $2
      GROUP BY sa.id, sa.agent_name, sa.agent_type, sa.sector_key, sa.status, sa.enabled, sa.created_at
    `;

    const result = await db.query(query, [agentId, userClientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    logger.info('Agent status retrieved', {
      agentId,
      status: result.rows[0].status
    });

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error fetching agent status', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch agent status' });
  }
});

// ============================================================================
// 3. QUEUE STATUS ENDPOINTS
// ============================================================================

/**
 * GET /api/metrics/queue/status
 * Get current queue status
 */
router.get('/queue/status', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;

    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)))::NUMERIC, 0) as avg_wait_seconds
      FROM calls
      WHERE client_id = $1 
        AND status IN ('queued', 'active')
        AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY status
    `;

    const result = await db.query(query, [userClientId]);

    const queueStatus = {
      queued: 0,
      active: 0,
      avgWaitTime: 0
    };

    result.rows.forEach(row => {
      if (row.status === 'queued') {
        queueStatus.queued = parseInt(row.count);
        queueStatus.avgWaitTime = parseInt(row.avg_wait_seconds);
      } else if (row.status === 'active') {
        queueStatus.active = parseInt(row.count);
      }
    });

    logger.info('Queue status retrieved', {
      queuedCalls: queueStatus.queued
    });

    res.json({
      success: true,
      data: queueStatus
    });
  } catch (error) {
    logger.error('Error fetching queue status', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

// ============================================================================
// 4. SYSTEM HEALTH ENDPOINTS
// ============================================================================

/**
 * GET /api/metrics/health
 * Get system health metrics
 */
router.get('/health', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;

    // Database connection time
    const startDb = Date.now();
    await db.query('SELECT 1');
    const dbTime = Date.now() - startDb;

    // Query performance metrics
    const queryPerf = await db.query(`
      SELECT 
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)))::NUMERIC * 1000, 2) as avg_api_response_ms
      FROM agent_metrics
      WHERE client_id = $1 
        AND created_at > NOW() - INTERVAL '1 hour'
    `, [userClientId]);

    const health = {
      status: 'healthy',
      timestamp: new Date(),
      database: {
        responseTime: dbTime,
        status: dbTime < 100 ? 'healthy' : dbTime < 500 ? 'degraded' : 'unhealthy'
      },
      api: {
        avgResponseTime: parseFloat(queryPerf.rows[0]?.avg_api_response_ms) || 0,
        status: (parseFloat(queryPerf.rows[0]?.avg_api_response_ms) || 0) < 100 ? 'healthy' : 'degraded'
      }
    };

    health.status = (health.database.status === 'healthy' && health.api.status === 'healthy') 
      ? 'healthy' 
      : 'degraded';

    logger.info('System health checked', {
      status: health.status
    });

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Error checking system health', {
      error: error.message
    });
    res.status(500).json({ 
      error: 'Failed to check system health',
      health: { status: 'unhealthy' }
    });
  }
});

// ============================================================================
// ERROR HANDLERS
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Metrics route error', {
    error: error.message,
    path: req.path
  });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
