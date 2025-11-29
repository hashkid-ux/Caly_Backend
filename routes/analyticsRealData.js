const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth/authMiddleware');
const db = require('../db/postgres');

/**
 * Analytics Routes - REAL DATA from Database
 * All numbers come from calls, actions, team_performance tables
 * NO mock data, NO hardcoded values
 */

/**
 * GET /api/analytics/kpis
 * Real Key Performance Indicators (PostgreSQL)
 * Query: ?days=7|30|90
 */
router.get('/kpis', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { days = 7 } = req.query;
    const daysInt = Math.min(Math.max(parseInt(days) || 7, 1), 365);

    // Query 1: Today's calls metrics
    const todayResult = await db.query(`
      SELECT 
        COUNT(*) as calls_today,
        AVG(duration_seconds) as avg_duration_today,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as completed_today,
        SUM(CASE WHEN resolved = false THEN 1 ELSE 0 END) as failed_today
      FROM calls
      WHERE client_id = $1 AND DATE(start_ts) = CURRENT_DATE
    `, [userClientId]);

    // Query 2: Period metrics (last N days)
    const periodResult = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        AVG(duration_seconds) as avg_duration,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as completed_calls,
        SUM(CASE WHEN resolved = false THEN 1 ELSE 0 END) as failed_calls,
        AVG(customer_satisfaction) as avg_satisfaction
      FROM calls
      WHERE client_id = $1 
      AND start_ts >= NOW() - INTERVAL '${daysInt} days'
    `, [userClientId]);

    // Query 3: Hourly trends for period
    const trendsResult = await db.query(`
      SELECT 
        DATE(start_ts) as date,
        COUNT(*) as call_count,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as completed_count,
        AVG(duration_seconds) as avg_duration
      FROM calls
      WHERE client_id = $1 
      AND start_ts >= NOW() - INTERVAL '${daysInt} days'
      GROUP BY DATE(start_ts)
      ORDER BY date DESC
    `, [userClientId]);

    // Query 4: Completion rate breakdown
    const completionResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as resolved,
        ROUND(SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as completion_rate
      FROM calls
      WHERE client_id = $1 
      AND start_ts >= NOW() - INTERVAL '${daysInt} days'
    `, [userClientId]);

    const today = todayResult.rows[0] || {};
    const period = periodResult.rows[0] || {};
    const trends = trendsResult.rows || [];
    const completion = completionResult.rows[0] || {};

    res.json({
      success: true,
      data: {
        kpis: {
          calls_today: parseInt(today.calls_today || 0),
          avg_duration_today: Math.round(parseFloat(today.avg_duration_today || 0)),
          completed_today: parseInt(today.completed_today || 0),
          failed_today: parseInt(today.failed_today || 0),
          total_calls_period: parseInt(period.total_calls || 0),
          avg_duration_period: Math.round(parseFloat(period.avg_duration || 0)),
          completed_period: parseInt(period.completed_calls || 0),
          failed_period: parseInt(period.failed_calls || 0),
          avg_satisfaction: Math.round(parseFloat(period.avg_satisfaction || 0) * 10) / 10,
          completion_rate: parseFloat(completion.completion_rate || 0)
        },
        trends: trends.map(t => ({
          date: t.date,
          calls: parseInt(t.call_count),
          completed: parseInt(t.completed_count),
          avgDuration: Math.round(parseFloat(t.avg_duration || 0))
        })),
        period: {
          days: daysInt,
          from: new Date(Date.now() - daysInt * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching KPIs', { error: error.message, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch KPIs',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
});

/**
 * GET /api/analytics/summary
 * Quick summary for dashboard widgets
 */
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { days = 30 } = req.query;
    const daysInt = Math.min(Math.max(parseInt(days) || 30, 1), 365);

    const summary = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(DISTINCT DATE(start_ts)) as active_days,
        AVG(customer_satisfaction) as avg_satisfaction,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as resolved_calls
      FROM calls
      WHERE client_id = $1 AND start_ts >= NOW() - INTERVAL '${daysInt} days'
    `, [userClientId]);

    const data = summary.rows[0] || {};

    res.json({
      success: true,
      data: {
        total_calls: parseInt(data.total_calls || 0),
        active_days: parseInt(data.active_days || 0),
        avg_satisfaction: Math.round(parseFloat(data.avg_satisfaction || 0) * 10) / 10,
        resolved_calls: parseInt(data.resolved_calls || 0),
        period_days: daysInt
      }
    });

  } catch (error) {
    logger.error('Error fetching summary', { error: error.message, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch summary',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
});

module.exports = router;
