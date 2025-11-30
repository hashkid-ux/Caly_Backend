// routes/analytics.js - Analytics and KPI endpoints
const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));
const { authMiddleware } = require(resolve('auth/authMiddleware'));
const { withTimeout } = require(resolve('utils/timeoutUtil'));

// GET /api/analytics/kpis - Get key performance indicators (MULTI-TENANT: filtered by user's company)
router.get('/kpis', authMiddleware, async (req, res) => {
  try {
    // SECURITY FIX: Add 30-second timeout to prevent DoS via slow queries
    await withTimeout(
      (async () => {
        // CRITICAL: User can only see their own company's analytics
        // Fixed: authMiddleware now applied - req.user is guaranteed to exist
        const userClientId = req.user.client_id;
        const { start_date, end_date } = req.query;

        let whereClause = 'WHERE c.client_id = $1';
        const params = [userClientId];
        let paramIndex = 2;

        if (start_date) {
          whereClause += ` AND c.start_ts >= $${paramIndex}`;
          params.push(start_date);
          paramIndex++;
        }

        if (end_date) {
          whereClause += ` AND c.start_ts <= $${paramIndex}`;
          params.push(end_date);
          paramIndex++;
        }

        // Total calls
        const totalCallsResult = await db.query(
          `SELECT COUNT(*) as total FROM calls c ${whereClause}`,
          params
        );

        // Resolved calls (automation rate)
        const resolvedParams = [...params];
        let resolvedWhereClause = whereClause.replace('WHERE ', 'WHERE ') + ' AND c.resolved = true';
        const resolvedCallsResult = await db.query(
          `SELECT COUNT(*) as resolved FROM calls c ${resolvedWhereClause}`,
          resolvedParams
        );

        // Average call duration (AHT)
        let ahtWhereClause = whereClause.replace('WHERE ', 'WHERE ') + ' AND c.end_ts IS NOT NULL';
        const avgDurationResult = await db.query(
          `SELECT AVG(EXTRACT(EPOCH FROM (c.end_ts - c.start_ts))) as avg_duration
           FROM calls c ${ahtWhereClause}`,
          params
        );

        // Actions breakdown
        const actionsResult = await db.query(
          `SELECT a.action_type, a.status, COUNT(*) as count
           FROM actions a
           JOIN calls c ON a.call_id = c.id
           ${whereClause}
           GROUP BY a.action_type, a.status`,
          params
        );

        const totalCalls = parseInt(totalCallsResult.rows[0].total);
        const resolvedCalls = parseInt(resolvedCallsResult.rows[0].resolved);
        const automationRate = totalCalls > 0 ? (resolvedCalls / totalCalls) * 100 : 0;
        const avgHandlingTime = parseFloat(avgDurationResult.rows[0].avg_duration) || 0;

        res.json({
          total_calls: totalCalls,
          resolved_calls: resolvedCalls,
          automation_rate: automationRate.toFixed(2) + '%',
          avg_handling_time_seconds: Math.round(avgHandlingTime),
          actions_breakdown: actionsResult.rows,
          period: {
            start: start_date || 'all_time',
            end: end_date || 'now'
          }
        });
      })(),
      30000,  // 30-second timeout
      'KPI analytics query'
    );

  } catch (error) {
    logger.error('Error fetching KPIs', { error: error.message });
    if (error.message.includes('timed out')) {
      res.status(408).json({ error: 'Query took too long. Please try with a narrower time range.' });
    } else {
      res.status(500).json({ error: 'Failed to fetch KPIs' });
    }
  }
});

// GET /api/analytics/hourly - Hourly call volume
router.get('/hourly', authMiddleware, async (req, res) => {
  try {
    // SECURITY FIX: Use authenticated user's client_id, NOT query parameter
    // This prevents multi-tenancy bypass where users could query other companies' data
    const { date } = req.query;  // date parameter still allowed, but NOT client_id
    const userClientId = req.user.client_id;

    let whereClause = 'WHERE client_id = $1';
    const params = [userClientId];
    let paramIndex = 2;

    if (date) {
      whereClause += ` AND DATE(start_ts) = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }

    const result = await db.query(
      `SELECT 
        EXTRACT(HOUR FROM start_ts) as hour,
        COUNT(*) as call_count,
        COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_count
       FROM calls
       ${whereClause}
       GROUP BY hour
       ORDER BY hour`,
      params
    );

    res.json({
      hourly_data: result.rows
    });

  } catch (error) {
    logger.error('Error fetching hourly analytics', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch hourly analytics' });
  }
});

// GET /api/analytics/daily - Daily trends
router.get('/daily', authMiddleware, async (req, res) => {
  try {
    // SECURITY FIX: Use authenticated user's client_id, NOT query parameter
    // SECURITY FIX: Use parameterized query to prevent SQL injection
    const daysInt = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 365);
    const userClientId = req.user.client_id;

    let whereClause = 'WHERE client_id = $1 AND start_ts >= NOW() - CAST($2 AS INTERVAL)';
    const params = [userClientId, `${daysInt} days`];
    let paramIndex = 3;

    const result = await db.query(
      `SELECT 
        DATE(start_ts) as date,
        COUNT(*) as call_count,
        COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_count,
        AVG(EXTRACT(EPOCH FROM (end_ts - start_ts))) as avg_duration
       FROM calls
       ${whereClause}
       GROUP BY date
       ORDER BY date DESC`,
      params
    );

    res.json({
      daily_trends: result.rows
    });

  } catch (error) {
    logger.error('Error fetching daily analytics', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch daily analytics' });
  }
});

module.exports = router;