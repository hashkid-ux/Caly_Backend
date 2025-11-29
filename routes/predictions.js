/**
 * Predictive Analytics Endpoints
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Endpoints for forecasting, anomaly detection, and recommendations
 */

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const { authMiddleware } = require('../auth/authMiddleware');
const logger = require('../utils/logger');

// ============================================================================
// 1. CALL VOLUME FORECASTING
// ============================================================================

/**
 * GET /api/analytics/predictions/call-volume
 * Get call volume forecast
 * Query params: days (1-30), sector (optional)
 */
router.get('/predictions/call-volume', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { days = 7, sector } = req.query;

    if (days < 1 || days > 30) {
      return res.status(400).json({
        error: 'days must be between 1 and 30'
      });
    }

    let query = `
      SELECT 
        pa.prediction_for_date,
        pa.predicted_call_volume,
        pa.upper_bound,
        pa.lower_bound,
        pa.forecast_confidence,
        pa.peak_hour,
        pa.peak_hour_call_volume,
        pa.model_accuracy,
        pa.action_recommended
      FROM predictive_analytics pa
      WHERE pa.client_id = $1 
        AND pa.prediction_for_date >= CURRENT_DATE
        AND pa.prediction_for_date <= CURRENT_DATE + INTERVAL '${parseInt(days)} days'
    `;

    const params = [userClientId];

    if (sector) {
      query += ' AND pa.sector_key = $2';
      params.push(sector);
    }

    query += ' ORDER BY pa.prediction_for_date ASC';

    const result = await db.query(query, params);

    logger.info('Call volume forecast retrieved', {
      days: parseInt(days),
      predictions: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      forecastWindow: `${days} days`
    });
  } catch (error) {
    logger.error('Error fetching call volume forecast', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

/**
 * GET /api/analytics/predictions/staffing
 * Get recommended staffing levels
 */
router.get('/predictions/staffing', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { days = 7 } = req.query;

    const query = `
      SELECT 
        prediction_for_date,
        predicted_call_volume,
        recommended_agents,
        optimal_utilization_percent,
        action_recommended
      FROM predictive_analytics
      WHERE client_id = $1 
        AND prediction_for_date >= CURRENT_DATE
        AND prediction_for_date <= CURRENT_DATE + INTERVAL '${parseInt(days)} days'
        AND recommended_agents IS NOT NULL
      ORDER BY prediction_for_date ASC
    `;

    const result = await db.query(query, [userClientId]);

    logger.info('Staffing recommendations retrieved');

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching staffing recommendations', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch staffing recommendations' });
  }
});

// ============================================================================
// 2. ANOMALY DETECTION & ALERTS
// ============================================================================

/**
 * GET /api/analytics/predictions/anomalies
 * Get detected anomalies
 * Query params: severity (Critical, High, Medium, Low)
 */
router.get('/predictions/anomalies', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { severity, status = 'New', limit = 50 } = req.query;

    let query = `
      SELECT 
        id,
        agent_id,
        anomaly_type,
        severity_level,
        metric_name,
        expected_value,
        actual_value,
        deviation_percent,
        anomaly_detected_at,
        anomaly_status,
        root_cause_identified,
        resolution_action,
        alert_sent
      FROM anomaly_detection
      WHERE client_id = $1 
        AND anomaly_status = $2
    `;

    const params = [userClientId, status];

    if (severity) {
      query += ' AND severity_level = $3';
      params.push(severity);
      query += ` ORDER BY anomaly_detected_at DESC LIMIT $${params.length + 1}`;
    } else {
      query += ` ORDER BY anomaly_detected_at DESC LIMIT $${params.length + 1}`;
    }

    params.push(parseInt(limit));

    const result = await db.query(query, params);

    logger.info('Anomalies retrieved', {
      count: result.rows.length,
      status
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      filter: { severity, status }
    });
  } catch (error) {
    logger.error('Error fetching anomalies', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch anomalies' });
  }
});

/**
 * PUT /api/analytics/predictions/anomalies/:anomalyId/investigate
 * Update anomaly investigation status
 */
router.put('/predictions/anomalies/:anomalyId/investigate', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { anomalyId } = req.params;
    const { notes, rootCause, status = 'Investigating' } = req.body;

    const query = `
      UPDATE anomaly_detection
      SET 
        anomaly_status = $2,
        investigation_notes = $3,
        root_cause_identified = $4,
        updated_at = NOW()
      WHERE id = $1 AND client_id = $5
      RETURNING *
    `;

    const result = await db.query(query, [
      anomalyId,
      status,
      notes,
      rootCause,
      userClientId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    logger.info('Anomaly investigation updated', {
      anomalyId,
      status
    });

    res.json({
      success: true,
      message: 'Anomaly updated',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating anomaly', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to update anomaly' });
  }
});

// ============================================================================
// 3. RECOMMENDATIONS ENGINE
// ============================================================================

/**
 * GET /api/analytics/predictions/recommendations
 * Get AI recommendations
 */
router.get('/predictions/recommendations', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { priority = 'High' } = req.query;

    const query = `
      SELECT 
        id,
        anomaly_type,
        priority_level,
        action_recommended,
        expected_impact,
        estimated_revenue_impact
      FROM predictive_analytics
      WHERE client_id = $1 
        AND priority_level IN ('Critical', $2)
        AND action_recommended IS NOT NULL
      ORDER BY priority_level DESC, prediction_date DESC
      LIMIT 20
    `;

    const result = await db.query(query, [userClientId, priority]);

    logger.info('Recommendations retrieved', {
      count: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching recommendations', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// ============================================================================
// 4. CHURN PREDICTION
// ============================================================================

/**
 * GET /api/analytics/predictions/churn-risk
 * Get customer churn risk assessment
 */
router.get('/predictions/churn-risk', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;

    const query = `
      SELECT 
        prediction_for_date,
        churn_risk_percent,
        churn_score,
        action_recommended,
        priority_level
      FROM predictive_analytics
      WHERE client_id = $1 
        AND churn_risk_percent > 0
        AND prediction_for_date >= CURRENT_DATE
      ORDER BY churn_risk_percent DESC
      LIMIT 100
    `;

    const result = await db.query(query, [userClientId]);

    const averageChurnRisk = result.rows.length > 0
      ? (result.rows.reduce((sum, row) => sum + row.churn_risk_percent, 0) / result.rows.length).toFixed(2)
      : 0;

    logger.info('Churn risk retrieved');

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      statistics: {
        averageChurnRisk,
        highRiskCount: result.rows.filter(r => r.churn_risk_percent > 50).length
      }
    });
  } catch (error) {
    logger.error('Error fetching churn risk', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch churn risk' });
  }
});

// ============================================================================
// ERROR HANDLERS
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Predictions route error', {
    error: error.message,
    path: req.path
  });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
