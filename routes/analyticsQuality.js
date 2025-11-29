/**
 * Call Quality Analytics Endpoints
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Endpoints for call quality metrics, audio analysis, and quality scoring
 */

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const { authMiddleware } = require('../auth/authMiddleware');
const logger = require('../utils/logger');

// ============================================================================
// 1. CALL QUALITY SCORES ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/calls/quality
 * Get call quality metrics for client
 * Query params: startDate, endDate, agentId (optional)
 */
router.get('/calls/quality', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate, agentId, limit = 100 } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required'
      });
    }

    let query = `
      SELECT 
        cqs.id,
        cqs.call_id,
        c.caller_name,
        sa.agent_name,
        sa.agent_type,
        cqs.professionalism_score,
        cqs.empathy_score,
        cqs.resolution_score,
        cqs.clarity_score,
        cqs.responsiveness_score,
        cqs.overall_quality_score,
        cqs.quality_tier,
        cqs.audio_clarity_percent,
        cqs.background_noise_level,
        cqs.review_date,
        cqs.notes,
        c.call_duration
      FROM call_quality_scores cqs
      JOIN calls c ON cqs.call_id = c.id
      LEFT JOIN sector_agents sa ON cqs.reviewed_by_agent_id = sa.id
      WHERE cqs.client_id = $1 
        AND cqs.review_date::DATE BETWEEN $2 AND $3
    `;

    const params = [userClientId, startDate, endDate];

    if (agentId) {
      query += ' AND c.agent_id = $4';
      params.push(agentId);
    }

    query += ` ORDER BY cqs.review_date DESC
              LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    // Calculate quality statistics
    const stats = {
      totalReviewed: result.rows.length,
      avgOverallScore: result.rows.length > 0 
        ? (result.rows.reduce((sum, row) => sum + (row.overall_quality_score || 0), 0) / result.rows.length).toFixed(2)
        : 0,
      qualityDistribution: {
        excellent: result.rows.filter(r => r.quality_tier === 'Excellent').length,
        good: result.rows.filter(r => r.quality_tier === 'Good').length,
        fair: result.rows.filter(r => r.quality_tier === 'Fair').length,
        poor: result.rows.filter(r => r.quality_tier === 'Poor').length
      }
    };

    logger.info('Call quality metrics retrieved', {
      userId: req.user.id,
      clientId: userClientId,
      reviewCount: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      statistics: stats
    });
  } catch (error) {
    logger.error('Error fetching call quality metrics', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch call quality metrics' });
  }
});

/**
 * POST /api/analytics/calls/quality
 * Create new call quality score
 */
router.post('/calls/quality', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const {
      callId,
      professionalismScore,
      empathyScore,
      resolutionScore,
      clarityScore,
      responsivenessScore,
      audioClarity,
      backgroundNoiseLevel,
      speechRateWpm,
      silencePercent,
      reviewedByAgentId,
      notes
    } = req.body;

    // Validate input
    if (!callId) {
      return res.status(400).json({ error: 'callId is required' });
    }

    // Verify call exists and belongs to client
    const callCheck = await db.query(
      'SELECT id FROM calls WHERE id = $1 AND client_id = $2',
      [callId, userClientId]
    );

    if (callCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Calculate overall quality score
    const scores = [
      professionalismScore,
      empathyScore,
      resolutionScore,
      clarityScore,
      responsivenessScore
    ].filter(s => s !== undefined);

    const overallScore = scores.length > 0 
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
      : null;

    // Determine quality tier
    let qualityTier = 'Fair';
    if (overallScore >= 4.5) qualityTier = 'Excellent';
    else if (overallScore >= 3.5) qualityTier = 'Good';
    else if (overallScore >= 2.5) qualityTier = 'Fair';
    else qualityTier = 'Poor';

    const query = `
      INSERT INTO call_quality_scores (
        client_id,
        call_id,
        professionalism_score,
        empathy_score,
        resolution_score,
        clarity_score,
        responsiveness_score,
        audio_clarity_percent,
        background_noise_level,
        speech_rate_wpm,
        silence_percent,
        overall_quality_score,
        quality_tier,
        reviewed_by_agent_id,
        review_date,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15)
      RETURNING *
    `;

    const params = [
      userClientId,
      callId,
      professionalismScore,
      empathyScore,
      resolutionScore,
      clarityScore,
      responsivenessScore,
      audioClarity,
      backgroundNoiseLevel,
      speechRateWpm,
      silencePercent,
      overallScore,
      qualityTier,
      reviewedByAgentId,
      notes
    ];

    const result = await db.query(query, params);

    logger.info('Call quality score created', {
      callId,
      qualityTier,
      overallScore
    });

    res.json({
      success: true,
      message: 'Quality score recorded',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error creating call quality score', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to create quality score' });
  }
});

/**
 * GET /api/analytics/calls/quality/summary
 * Get quality summary by dimension
 */
router.get('/calls/quality/summary', authMiddleware, async (req, res) => {
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
        COUNT(*) as total_calls_reviewed,
        ROUND(AVG(professionalism_score)::NUMERIC, 2) as avg_professionalism,
        ROUND(AVG(empathy_score)::NUMERIC, 2) as avg_empathy,
        ROUND(AVG(resolution_score)::NUMERIC, 2) as avg_resolution,
        ROUND(AVG(clarity_score)::NUMERIC, 2) as avg_clarity,
        ROUND(AVG(responsiveness_score)::NUMERIC, 2) as avg_responsiveness,
        ROUND(AVG(overall_quality_score)::NUMERIC, 2) as avg_overall,
        ROUND(AVG(audio_clarity_percent)::NUMERIC, 2) as avg_audio_clarity,
        ROUND(AVG(background_noise_level)::NUMERIC, 2) as avg_background_noise,
        ROUND(AVG(speech_rate_wpm)::NUMERIC, 0) as avg_speech_rate,
        ROUND(AVG(silence_percent)::NUMERIC, 2) as avg_silence_percent
      FROM call_quality_scores
      WHERE client_id = $1 
        AND review_date::DATE BETWEEN $2 AND $3
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('Quality summary retrieved', {
      dateRange: `${startDate} to ${endDate}`
    });

    res.json({
      success: true,
      data: result.rows[0] || {}
    });
  } catch (error) {
    logger.error('Error fetching quality summary', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch quality summary' });
  }
});

// ============================================================================
// 2. CALL COMPLETION & RESOLUTION ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/calls/completion
 * Get call completion and FCR metrics
 */
router.get('/calls/completion', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate, agentId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required'
      });
    }

    let query = `
      SELECT 
        DATE(am.created_at) as call_date,
        COUNT(am.id) as total_calls,
        SUM(CASE WHEN am.call_completed THEN 1 ELSE 0 END) as completed_calls,
        ROUND(SUM(CASE WHEN am.call_completed THEN 1 ELSE 0 END)::FLOAT / COUNT(am.id) * 100, 2) as completion_rate,
        SUM(CASE WHEN am.first_contact_resolved THEN 1 ELSE 0 END) as fcr_count,
        ROUND(SUM(CASE WHEN am.first_contact_resolved THEN 1 ELSE 0 END)::FLOAT / NULLIF(SUM(CASE WHEN am.call_completed THEN 1 ELSE 0 END), 0) * 100, 2) as fcr_rate,
        SUM(CASE WHEN am.transfer_flag THEN 1 ELSE 0 END) as transfer_count,
        SUM(CASE WHEN am.escalation_flag THEN 1 ELSE 0 END) as escalation_count,
        ROUND(SUM(CASE WHEN am.customer_callback_needed THEN 1 ELSE 0 END)::FLOAT / COUNT(am.id) * 100, 2) as callback_percent
      FROM agent_metrics am
      WHERE am.client_id = $1 
        AND am.created_at::DATE BETWEEN $2 AND $3
    `;

    const params = [userClientId, startDate, endDate];

    if (agentId) {
      query += ' AND am.agent_id = $4';
      params.push(agentId);
    }

    query += ` GROUP BY DATE(am.created_at)
              ORDER BY DATE(am.created_at) DESC`;

    const result = await db.query(query, params);

    logger.info('Call completion metrics retrieved', {
      recordCount: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching completion metrics', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch completion metrics' });
  }
});

/**
 * GET /api/analytics/calls/timeline
 * Get quality metrics timeline
 */
router.get('/calls/timeline', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate, days = 30 } = req.query;

    const query = `
      SELECT 
        DATE(cqs.review_date) as quality_date,
        COUNT(*) as calls_reviewed,
        ROUND(AVG(cqs.overall_quality_score)::NUMERIC, 2) as avg_score,
        ROUND(AVG(cqs.audio_clarity_percent)::NUMERIC, 2) as avg_clarity
      FROM call_quality_scores cqs
      WHERE cqs.client_id = $1 
        AND cqs.review_date::DATE >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(cqs.review_date)
      ORDER BY DATE(cqs.review_date) DESC
    `;

    const result = await db.query(query, [userClientId]);

    logger.info('Quality timeline retrieved', {
      days: parseInt(days)
    });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching quality timeline', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch quality timeline' });
  }
});

// ============================================================================
// ERROR HANDLERS
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Analytics quality route error', {
    error: error.message,
    path: req.path
  });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
