/**
 * Revenue & Cost Analytics Endpoints
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Endpoints for financial metrics, cost analysis, and ROI calculations
 */

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const { authMiddleware } = require('../auth/authMiddleware');
const logger = require('../utils/logger');

// ============================================================================
// 1. REVENUE ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/revenue/summary
 * Get overall revenue summary
 */
router.get('/revenue/summary', authMiddleware, async (req, res) => {
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
        COUNT(DISTINCT c.id) as total_calls,
        COUNT(DISTINCT ca.agent_id) as agents_involved,
        COALESCE(SUM(ca.call_value), 0) as total_revenue,
        ROUND(AVG(ca.call_value)::NUMERIC, 2) as avg_revenue_per_call,
        MAX(ca.call_value) as max_call_value,
        MIN(ca.call_value) as min_call_value
      FROM calls c
      LEFT JOIN call_actions ca ON c.id = ca.call_id
      WHERE c.client_id = $1 
        AND c.created_at::DATE BETWEEN $2 AND $3
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('Revenue summary retrieved', {
      userId: req.user.id,
      clientId: userClientId
    });

    res.json({
      success: true,
      data: result.rows[0] || {}
    });
  } catch (error) {
    logger.error('Error fetching revenue summary', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch revenue summary' });
  }
});

/**
 * GET /api/analytics/revenue/by-sector
 * Get revenue breakdown by sector
 */
router.get('/revenue/by-sector', authMiddleware, async (req, res) => {
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
        COUNT(DISTINCT c.id) as calls,
        COUNT(DISTINCT sa.id) as agents,
        COALESCE(SUM(ca.call_value), 0) as total_revenue,
        ROUND(AVG(ca.call_value)::NUMERIC, 2) as avg_per_call,
        ROUND(COALESCE(SUM(ca.call_value), 0) / NULLIF(COUNT(DISTINCT c.id), 0), 2) as revenue_per_call
      FROM sector_agents sa
      LEFT JOIN calls c ON sa.id = c.agent_id AND c.client_id = $1 AND c.created_at::DATE BETWEEN $2 AND $3
      LEFT JOIN call_actions ca ON c.id = ca.call_id
      WHERE sa.client_id = $1
      GROUP BY sa.sector_key
      ORDER BY total_revenue DESC
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('Revenue by sector retrieved', {
      sectorCount: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching revenue by sector', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch revenue by sector' });
  }
});

/**
 * GET /api/analytics/revenue/by-agent
 * Get revenue by individual agent
 */
router.get('/revenue/by-agent', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate, limit = 50 } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required'
      });
    }

    const query = `
      SELECT 
        sa.id as agent_id,
        sa.agent_name,
        sa.agent_type,
        sa.sector_key,
        COUNT(DISTINCT c.id) as calls,
        COALESCE(SUM(ca.call_value), 0) as total_revenue,
        ROUND(AVG(ca.call_value)::NUMERIC, 2) as avg_per_call,
        ROUND(AVG(am.quality_score)::NUMERIC, 2) as avg_quality
      FROM sector_agents sa
      LEFT JOIN calls c ON sa.id = c.agent_id AND c.client_id = $1 AND c.created_at::DATE BETWEEN $2 AND $3
      LEFT JOIN call_actions ca ON c.id = ca.call_id
      LEFT JOIN agent_metrics am ON c.id = am.call_id
      WHERE sa.client_id = $1
      GROUP BY sa.id, sa.agent_name, sa.agent_type, sa.sector_key
      HAVING COUNT(DISTINCT c.id) > 0
      ORDER BY total_revenue DESC
      LIMIT $4
    `;

    const result = await db.query(query, [userClientId, startDate, endDate, parseInt(limit)]);

    logger.info('Revenue by agent retrieved', {
      agentCount: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching revenue by agent', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch revenue by agent' });
  }
});

// ============================================================================
// 2. COST ANALYSIS ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/cost/summary
 * Get overall cost summary
 */
router.get('/cost/summary', authMiddleware, async (req, res) => {
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
        SUM(total_cost) as total_cost,
        AVG(cost_per_call) as avg_cost_per_call,
        SUM(agent_salary_cost) as salary_cost,
        SUM(technology_cost) as tech_cost,
        SUM(infrastructure_cost) as infra_cost,
        SUM(training_cost) as training_cost,
        SUM(other_cost) as other_cost
      FROM cost_analysis
      WHERE client_id = $1 
        AND cost_period_start::DATE >= $2 
        AND cost_period_end::DATE <= $3
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('Cost summary retrieved');

    res.json({
      success: true,
      data: result.rows[0] || {}
    });
  } catch (error) {
    logger.error('Error fetching cost summary', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

/**
 * POST /api/analytics/cost/record
 * Record cost metrics
 */
router.post('/cost/record', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const {
      agentId,
      sectorKey,
      salaryCoSt,
      technologyCost,
      infrastructureCost,
      trainingCost,
      benefitsCost,
      otherCost
    } = req.body;

    const totalCost = salaryCoSt + technologyCost + infrastructureCost + trainingCost + benefitsCost + otherCost;

    const query = `
      INSERT INTO cost_analysis (
        client_id,
        agent_id,
        sector_key,
        analysis_date,
        cost_period_start,
        cost_period_end,
        agent_salary_cost,
        technology_cost,
        infrastructure_cost,
        training_cost,
        benefits_cost,
        other_cost,
        total_cost
      ) VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const params = [
      userClientId,
      agentId,
      sectorKey,
      salaryCoSt,
      technologyCost,
      infrastructureCost,
      trainingCost,
      benefitsCost,
      otherCost,
      totalCost
    ];

    const result = await db.query(query, params);

    logger.info('Cost recorded', { totalCost });

    res.json({
      success: true,
      message: 'Cost recorded',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error recording cost', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to record cost' });
  }
});

// ============================================================================
// 3. ROI & MARGIN ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/roi/summary
 * Get ROI summary
 */
router.get('/roi/summary', authMiddleware, async (req, res) => {
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
        SUM(total_revenue) as total_revenue,
        SUM(total_cost) as total_cost,
        SUM(total_revenue) - SUM(total_cost) as gross_profit,
        ROUND((SUM(total_revenue) - SUM(total_cost)) / NULLIF(SUM(total_cost), 0) * 100, 2) as roi_percent,
        ROUND((SUM(total_revenue) - SUM(total_cost)) / NULLIF(SUM(total_revenue), 0) * 100, 2) as margin_percent
      FROM cost_analysis
      WHERE client_id = $1 
        AND cost_period_start::DATE >= $2 
        AND cost_period_end::DATE <= $3
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('ROI summary retrieved');

    res.json({
      success: true,
      data: result.rows[0] || {}
    });
  } catch (error) {
    logger.error('Error fetching ROI summary', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch ROI summary' });
  }
});

/**
 * GET /api/analytics/roi/by-sector
 * Get ROI breakdown by sector
 */
router.get('/roi/by-sector', authMiddleware, async (req, res) => {
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
        sector_key,
        SUM(total_revenue) as revenue,
        SUM(total_cost) as cost,
        SUM(total_revenue) - SUM(total_cost) as profit,
        ROUND((SUM(total_revenue) - SUM(total_cost)) / NULLIF(SUM(total_cost), 0) * 100, 2) as roi_percent,
        ROUND((SUM(total_revenue) - SUM(total_cost)) / NULLIF(SUM(total_revenue), 0) * 100, 2) as margin_percent
      FROM cost_analysis
      WHERE client_id = $1 
        AND cost_period_start::DATE >= $2 
        AND cost_period_end::DATE <= $3
      GROUP BY sector_key
      ORDER BY profit DESC
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('ROI by sector retrieved');

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching ROI by sector', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch ROI by sector' });
  }
});

// ============================================================================
// ERROR HANDLERS
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Analytics revenue route error', {
    error: error.message,
    path: req.path
  });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
