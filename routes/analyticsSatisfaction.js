/**
 * Customer Satisfaction Analytics Endpoints
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Endpoints for CSAT, NPS, sentiment analysis, and feedback tracking
 */

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const { authMiddleware } = require('../auth/authMiddleware');
const logger = require('../utils/logger');

// ============================================================================
// 1. CSAT & NPS ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/satisfaction/metrics
 * Get overall satisfaction metrics
 */
router.get('/satisfaction/metrics', authMiddleware, async (req, res) => {
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
        COUNT(*) as total_responses,
        ROUND(AVG(csat_score)::NUMERIC, 2) as avg_csat_score,
        ROUND(AVG(nps_score)::NUMERIC, 2) as avg_nps_score,
        ROUND(AVG(sentiment_score)::NUMERIC, 2) as avg_sentiment,
        SUM(CASE WHEN would_recommend THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100 as recommend_percent,
        COUNT(CASE WHEN nps_category = 'Promoter' THEN 1 END) as promoters,
        COUNT(CASE WHEN nps_category = 'Passive' THEN 1 END) as passives,
        COUNT(CASE WHEN nps_category = 'Detractor' THEN 1 END) as detractors
      FROM customer_satisfaction
      WHERE client_id = $1 
        AND survey_responded_at::DATE BETWEEN $2 AND $3
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('Satisfaction metrics retrieved', {
      userId: req.user.id,
      clientId: userClientId
    });

    res.json({
      success: true,
      data: result.rows[0] || {}
    });
  } catch (error) {
    logger.error('Error fetching satisfaction metrics', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch satisfaction metrics' });
  }
});

/**
 * POST /api/analytics/satisfaction/survey
 * Submit satisfaction survey response
 */
router.post('/satisfaction/survey', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const {
      callId,
      customerId,
      csatScore,
      csatComment,
      npsScore,
      npsComment,
      sentimentScore,
      wouldRecommend,
      resolutionSatisfaction,
      speedSatisfaction,
      professionalismSatisfaction,
      feedbackCategory,
      feedbackText,
      surveyChannel
    } = req.body;

    if (!callId) {
      return res.status(400).json({ error: 'callId is required' });
    }

    // Determine sentiment category
    let sentimentCategory = 'Neutral';
    if (sentimentScore > 0.5) sentimentCategory = 'Very Positive';
    else if (sentimentScore > 0) sentimentCategory = 'Positive';
    else if (sentimentScore < -0.5) sentimentCategory = 'Very Negative';
    else if (sentimentScore < 0) sentimentCategory = 'Negative';

    // Determine NPS category
    let npsCategory = 'Passive';
    if (npsScore >= 9) npsCategory = 'Promoter';
    else if (npsScore <= 6) npsCategory = 'Detractor';

    const query = `
      INSERT INTO customer_satisfaction (
        client_id,
        call_id,
        customer_id,
        csat_score,
        csat_rating,
        csat_comment,
        nps_score,
        nps_category,
        nps_comment,
        sentiment_score,
        sentiment_category,
        would_recommend,
        resolution_satisfaction,
        speed_satisfaction,
        professionalism_satisfaction,
        primary_feedback_category,
        feedback_text,
        survey_sent_at,
        survey_responded_at,
        survey_channel
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW(), $18)
      RETURNING *
    `;

    // Determine CSAT rating
    let csatRating = 'Neutral';
    if (csatScore >= 4) csatRating = 'Very Satisfied';
    else if (csatScore >= 3) csatRating = 'Satisfied';
    else if (csatScore <= 2) csatRating = 'Dissatisfied';

    const params = [
      userClientId,
      callId,
      customerId,
      csatScore,
      csatRating,
      csatComment,
      npsScore,
      npsCategory,
      npsComment,
      sentimentScore,
      sentimentCategory,
      wouldRecommend,
      resolutionSatisfaction,
      speedSatisfaction,
      professionalismSatisfaction,
      feedbackCategory,
      feedbackText,
      surveyChannel || 'SMS'
    ];

    const result = await db.query(query, params);

    logger.info('Satisfaction survey recorded', {
      callId,
      csatScore,
      npsScore
    });

    res.json({
      success: true,
      message: 'Survey recorded',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error recording satisfaction survey', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to record survey' });
  }
});

/**
 * GET /api/analytics/satisfaction/trends
 * Get satisfaction trends over time
 */
router.get('/satisfaction/trends', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { days = 30 } = req.query;

    const query = `
      SELECT 
        DATE(survey_responded_at) as survey_date,
        COUNT(*) as responses,
        ROUND(AVG(csat_score)::NUMERIC, 2) as avg_csat,
        ROUND(AVG(nps_score)::NUMERIC, 2) as avg_nps,
        ROUND(AVG(sentiment_score)::NUMERIC, 2) as avg_sentiment
      FROM customer_satisfaction
      WHERE client_id = $1 
        AND survey_responded_at::DATE >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
        AND survey_responded_at IS NOT NULL
      GROUP BY DATE(survey_responded_at)
      ORDER BY DATE(survey_responded_at) DESC
    `;

    const result = await db.query(query, [userClientId]);

    logger.info('Satisfaction trends retrieved', { days: parseInt(days) });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching satisfaction trends', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch satisfaction trends' });
  }
});

// ============================================================================
// 2. SENTIMENT ANALYSIS ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/satisfaction/sentiment
 * Get sentiment analysis summary
 */
router.get('/satisfaction/sentiment', authMiddleware, async (req, res) => {
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
        sentiment_category,
        COUNT(*) as count,
        ROUND(COUNT(*)::FLOAT / (SELECT COUNT(*) FROM customer_satisfaction WHERE client_id = $1 AND survey_responded_at::DATE BETWEEN $2 AND $3) * 100, 2) as percent,
        ROUND(AVG(sentiment_score)::NUMERIC, 2) as avg_score
      FROM customer_satisfaction
      WHERE client_id = $1 
        AND survey_responded_at::DATE BETWEEN $2 AND $3
        AND sentiment_category IS NOT NULL
      GROUP BY sentiment_category
      ORDER BY count DESC
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('Sentiment analysis retrieved');

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching sentiment analysis', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch sentiment analysis' });
  }
});

// ============================================================================
// 3. FEEDBACK ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/satisfaction/feedback
 * Get customer feedback
 */
router.get('/satisfaction/feedback', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { limit = 100, category } = req.query;

    let query = `
      SELECT 
        id,
        call_id,
        customer_id,
        csat_score,
        nps_score,
        sentiment_category,
        primary_feedback_category,
        feedback_text,
        would_recommend,
        survey_responded_at
      FROM customer_satisfaction
      WHERE client_id = $1 
        AND feedback_text IS NOT NULL
    `;

    const params = [userClientId];

    if (category) {
      query += ' AND primary_feedback_category = $2';
      params.push(category);
      query += ` ORDER BY survey_responded_at DESC LIMIT $${params.length + 1}`;
    } else {
      query += ` ORDER BY survey_responded_at DESC LIMIT $${params.length + 1}`;
    }

    params.push(parseInt(limit));

    const result = await db.query(query, params);

    logger.info('Feedback retrieved', { count: result.rows.length });

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching feedback', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

/**
 * GET /api/analytics/satisfaction/feedback-categories
 * Get feedback category breakdown
 */
router.get('/satisfaction/feedback-categories', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { startDate, endDate } = req.query;

    const query = `
      SELECT 
        primary_feedback_category,
        COUNT(*) as count,
        ROUND(AVG(csat_score)::NUMERIC, 2) as avg_csat,
        ROUND(AVG(nps_score)::NUMERIC, 2) as avg_nps
      FROM customer_satisfaction
      WHERE client_id = $1 
        AND survey_responded_at::DATE BETWEEN $2 AND $3
        AND primary_feedback_category IS NOT NULL
      GROUP BY primary_feedback_category
      ORDER BY count DESC
    `;

    const result = await db.query(query, [userClientId, startDate, endDate]);

    logger.info('Feedback categories retrieved');

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching feedback categories', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch feedback categories' });
  }
});

// ============================================================================
// ERROR HANDLERS
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Analytics satisfaction route error', {
    error: error.message,
    path: req.path
  });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
