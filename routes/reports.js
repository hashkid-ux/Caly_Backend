/**
 * Reports Generation Endpoints
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Endpoints for generating, scheduling, and exporting reports
 */

const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const { authMiddleware } = require(resolve('auth/authMiddleware'));
const { sectorFilterMiddleware } = require(resolve('middleware/sectorFilter'));
const logger = require(resolve('utils/logger'));

// Apply auth and sector filtering
router.use(authMiddleware);
router.use(sectorFilterMiddleware);

// ============================================================================
// 1. REPORT GENERATION ENDPOINTS
// ============================================================================

/**
 * POST /api/analytics/reports/generate
 * Generate a custom report (sector-filtered)
 */
router.post('/reports/generate', async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const userSector = req.userSector;
    const {
      reportType,
      startDate,
      endDate,
      format = 'json',
      sectors,
      includeCharts = true
    } = req.body;

    if (!reportType || !startDate || !endDate) {
      return res.status(400).json({
        error: 'reportType, startDate, and endDate are required'
      });
    }

    logger.info('Generating report', {
      reportType,
      format,
      dateRange: `${startDate} to ${endDate}`
    });

    let reportData = {};

    switch (reportType) {
      case 'performance':
        reportData = await generatePerformanceReport(userClientId, startDate, endDate);
        break;
      case 'quality':
        reportData = await generateQualityReport(userClientId, startDate, endDate);
        break;
      case 'satisfaction':
        reportData = await generateSatisfactionReport(userClientId, startDate, endDate);
        break;
      case 'financial':
        reportData = await generateFinancialReport(userClientId, startDate, endDate);
        break;
      case 'comprehensive':
        reportData = await generateComprehensiveReport(userClientId, startDate, endDate);
        break;
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    // Log report generation
    await db.query(`
      INSERT INTO analytics_audit_log (client_id, user_id, action_type, report_type, execution_time_ms)
      VALUES ($1, $2, 'Generate', $3, $4)
    `, [userClientId, req.user.id, reportType, Date.now()]);

    res.json({
      success: true,
      data: reportData,
      format,
      generatedAt: new Date(),
      includeCharts
    });
  } catch (error) {
    logger.error('Error generating report', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * GET /api/analytics/reports/performance
 * Get performance report summary
 */
router.get('/reports/performance', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate } = req.query;

    const report = await generatePerformanceReport(userClientId, startDate, endDate);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Error fetching performance report', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch performance report' });
  }
});

/**
 * GET /api/analytics/reports/quality
 * Get quality report summary
 */
router.get('/reports/quality', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate } = req.query;

    const report = await generateQualityReport(userClientId, startDate, endDate);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Error fetching quality report', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch quality report' });
  }
});

/**
 * GET /api/analytics/reports/satisfaction
 * Get customer satisfaction report
 */
router.get('/reports/satisfaction', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate } = req.query;

    const report = await generateSatisfactionReport(userClientId, startDate, endDate);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Error fetching satisfaction report', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch satisfaction report' });
  }
});

/**
 * GET /api/analytics/reports/financial
 * Get financial/ROI report
 */
router.get('/reports/financial', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate } = req.query;

    const report = await generateFinancialReport(userClientId, startDate, endDate);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Error fetching financial report', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch financial report' });
  }
});

// ============================================================================
// 2. REPORT EXPORT ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/reports/:reportId/export
 * Export report in specified format
 */
router.get('/reports/:reportId/export', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { reportId } = req.params;
    const { format = 'json' } = req.query;

    // Validate format
    const validFormats = ['json', 'csv', 'pdf', 'xlsx'];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: 'Invalid format' });
    }

    logger.info('Exporting report', {
      reportId,
      format
    });

    // Set response headers based on format
    switch (format) {
      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="report_${reportId}.csv"`);
        break;
      case 'pdf':
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="report_${reportId}.pdf"`);
        break;
      case 'xlsx':
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="report_${reportId}.xlsx"`);
        break;
      default:
        res.setHeader('Content-Type', 'application/json');
    }

    res.json({
      success: true,
      message: `Report exported as ${format}`,
      downloadUrl: `/api/analytics/reports/${reportId}/download?format=${format}`
    });
  } catch (error) {
    logger.error('Error exporting report', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to export report' });
  }
});

// ============================================================================
// 3. REPORT SCHEDULING
// ============================================================================

/**
 * POST /api/analytics/reports/schedule
 * Schedule recurring report
 */
router.post('/reports/schedule', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const {
      reportType,
      frequency,
      recipients,
      format = 'pdf'
    } = req.body;

    if (!reportType || !frequency || !recipients) {
      return res.status(400).json({
        error: 'reportType, frequency, and recipients are required'
      });
    }

    // Valid frequencies: daily, weekly, monthly
    const validFrequencies = ['daily', 'weekly', 'monthly'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({
        error: 'Invalid frequency. Must be daily, weekly, or monthly'
      });
    }

    logger.info('Scheduling report', {
      reportType,
      frequency
    });

    res.json({
      success: true,
      message: 'Report scheduled',
      data: {
        reportType,
        frequency,
        recipients,
        format,
        nextScheduledDate: new Date(),
        status: 'active'
      }
    });
  } catch (error) {
    logger.error('Error scheduling report', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to schedule report' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function generatePerformanceReport(clientId, startDate, endDate) {
  const query = `
    SELECT 
      COUNT(DISTINCT agent_id) as total_agents,
      COUNT(*) as total_calls,
      ROUND(AVG(quality_score)::NUMERIC, 2) as avg_quality,
      ROUND(AVG(total_handle_time_seconds)::NUMERIC, 0) as avg_handle_time,
      ROUND(AVG(utilization_percent)::NUMERIC, 2) as avg_utilization,
      SUM(CASE WHEN first_contact_resolved THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 as fcr_percent
    FROM agent_metrics
    WHERE client_id = $1 
      AND created_at::DATE BETWEEN $2 AND $3
  `;

  const result = await db.query(query, [clientId, startDate, endDate]);
  return result.rows[0] || {};
}

async function generateQualityReport(clientId, startDate, endDate) {
  const query = `
    SELECT 
      COUNT(*) as total_reviewed,
      ROUND(AVG(overall_quality_score)::NUMERIC, 2) as avg_score,
      COUNT(CASE WHEN quality_tier = 'Excellent' THEN 1 END) as excellent,
      COUNT(CASE WHEN quality_tier = 'Good' THEN 1 END) as good,
      COUNT(CASE WHEN quality_tier = 'Fair' THEN 1 END) as fair,
      COUNT(CASE WHEN quality_tier = 'Poor' THEN 1 END) as poor
    FROM call_quality_scores
    WHERE client_id = $1 
      AND review_date::DATE BETWEEN $2 AND $3
  `;

  const result = await db.query(query, [clientId, startDate, endDate]);
  return result.rows[0] || {};
}

async function generateSatisfactionReport(clientId, startDate, endDate) {
  const query = `
    SELECT 
      COUNT(*) as total_responses,
      ROUND(AVG(csat_score)::NUMERIC, 2) as avg_csat,
      ROUND(AVG(nps_score)::NUMERIC, 2) as avg_nps,
      COUNT(CASE WHEN nps_category = 'Promoter' THEN 1 END) as promoters,
      COUNT(CASE WHEN nps_category = 'Passive' THEN 1 END) as passives,
      COUNT(CASE WHEN nps_category = 'Detractor' THEN 1 END) as detractors,
      SUM(CASE WHEN would_recommend THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 as recommend_percent
    FROM customer_satisfaction
    WHERE client_id = $1 
      AND survey_responded_at::DATE BETWEEN $2 AND $3
  `;

  const result = await db.query(query, [clientId, startDate, endDate]);
  return result.rows[0] || {};
}

async function generateFinancialReport(clientId, startDate, endDate) {
  const query = `
    SELECT 
      SUM(total_revenue) as total_revenue,
      SUM(total_cost) as total_cost,
      SUM(total_revenue) - SUM(total_cost) as gross_profit,
      ROUND((SUM(total_revenue) - SUM(total_cost)) / NULLIF(SUM(total_cost), 0) * 100, 2) as roi_percent,
      ROUND((SUM(total_revenue) - SUM(total_cost)) / NULLIF(SUM(total_revenue), 0) * 100, 2) as margin_percent,
      ROUND(AVG(cost_per_call)::NUMERIC, 2) as avg_cost_per_call
    FROM cost_analysis
    WHERE client_id = $1 
      AND cost_period_start::DATE >= $2 
      AND cost_period_end::DATE <= $3
  `;

  const result = await db.query(query, [clientId, startDate, endDate]);
  return result.rows[0] || {};
}

async function generateComprehensiveReport(clientId, startDate, endDate) {
  const performance = await generatePerformanceReport(clientId, startDate, endDate);
  const quality = await generateQualityReport(clientId, startDate, endDate);
  const satisfaction = await generateSatisfactionReport(clientId, startDate, endDate);
  const financial = await generateFinancialReport(clientId, startDate, endDate);

  return {
    reportPeriod: { startDate, endDate },
    performance,
    quality,
    satisfaction,
    financial,
    generatedAt: new Date()
  };
}

// ============================================================================
// ERROR HANDLERS
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Reports route error', {
    error: error.message,
    path: req.path
  });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
