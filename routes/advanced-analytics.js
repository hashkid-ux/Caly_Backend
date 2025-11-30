const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../utils/logger');
const { withTimeout } = require('../utils/timeoutUtil');
const resolve = require('../utils/moduleResolver');

/**
 * Advanced Analytics Routes - Phase 10
 * Comprehensive performance metrics, trend analysis, and business intelligence
 * Requires: authMiddleware (user must be logged in)
 */

// ===== DASHBOARD ANALYTICS =====

/**
 * GET /api/analytics/dashboard
 * Main dashboard KPIs for team overview
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { days = 30 } = req.query;
    const daysInt = parseInt(days);

    const result = await withTimeout(async () => {
      // Calls summary
      const callsStats = await db.query(
        `SELECT 
          COUNT(*) as total_calls,
          COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_calls,
          AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_duration,
          COUNT(CASE WHEN escalated = true THEN 1 END) as escalated_count
        FROM calls 
        WHERE client_id = $1 AND created_at > NOW() - INTERVAL '${daysInt} days'`,
        [client_id]
      );

      // Team metrics
      const teamStats = await db.query(
        `SELECT 
          COUNT(*) as team_size,
          AVG(qa_score) as avg_qa_score,
          MAX(qa_score) as max_qa_score,
          MIN(qa_score) as min_qa_score
        FROM team_members 
        WHERE client_id = $1 AND status = 'active'`,
        [client_id]
      );

      // Agent performance
      const agentStats = await db.query(
        `SELECT 
          team_member_id,
          tm.name,
          COUNT(*) as calls_handled,
          AVG(EXTRACT(EPOCH FROM (c.ended_at - c.started_at))) as avg_call_duration,
          COUNT(CASE WHEN c.resolved = true THEN 1 END) as resolved_count,
          COALESCE(tm.qa_score, 0) as qa_score
        FROM calls c
        JOIN team_members tm ON c.team_member_id = tm.id
        WHERE c.client_id = $1 AND c.created_at > NOW() - INTERVAL '${daysInt} days'
        GROUP BY c.team_member_id, tm.name, tm.qa_score
        ORDER BY calls_handled DESC
        LIMIT 10`,
        [client_id]
      );

      return {
        period_days: daysInt,
        calls: callsStats.rows[0] || {},
        team: teamStats.rows[0] || {},
        top_agents: agentStats.rows || []
      };
    }, 30000, 'dashboard analytics');

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard analytics'
    });
  }
});

// ===== PERFORMANCE TRENDS =====

/**
 * GET /api/analytics/trends
 * Daily/weekly performance trends over time
 */
router.get('/trends', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { metric = 'calls', period = 'daily', days = 30 } = req.query;
    const daysInt = parseInt(days);

    const result = await withTimeout(async () => {
      let query, groupBy;

      if (period === 'daily') {
        groupBy = `DATE(c.created_at)`;
      } else if (period === 'weekly') {
        groupBy = `DATE_TRUNC('week', c.created_at)`;
      } else {
        groupBy = `DATE_TRUNC('month', c.created_at)`;
      }

      if (metric === 'calls') {
        query = `
          SELECT 
            ${groupBy} as period,
            COUNT(*) as value,
            COUNT(CASE WHEN resolved = true THEN 1 END) as resolved,
            AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_duration
          FROM calls 
          WHERE client_id = $1 AND created_at > NOW() - INTERVAL '${daysInt} days'
          GROUP BY ${groupBy}
          ORDER BY ${groupBy} ASC
        `;
      } else if (metric === 'qa_scores') {
        query = `
          SELECT 
            ${groupBy} as period,
            AVG(qr.qa_score) as value,
            COUNT(qr.id) as reviews_count,
            COUNT(CASE WHEN qr.status = 'flagged' THEN 1 END) as flagged_count
          FROM qa_reviews qr
          WHERE qr.client_id = $1 AND qr.created_at > NOW() - INTERVAL '${daysInt} days'
          GROUP BY ${groupBy}
          ORDER BY ${groupBy} ASC
        `;
      } else if (metric === 'resolution_rate') {
        query = `
          SELECT 
            ${groupBy} as period,
            ROUND(100.0 * COUNT(CASE WHEN resolved = true THEN 1 END) / COUNT(*), 2) as value,
            COUNT(*) as total_calls
          FROM calls 
          WHERE client_id = $1 AND created_at > NOW() - INTERVAL '${daysInt} days'
          GROUP BY ${groupBy}
          ORDER BY ${groupBy} ASC
        `;
      }

      const trends = await db.query(query, [client_id]);
      return trends.rows;
    }, 30000, 'trends analytics');

    res.json({
      success: true,
      data: {
        metric,
        period,
        trends: result
      }
    });
  } catch (error) {
    logger.error('Trends analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trends'
    });
  }
});

// ===== TEAM PERFORMANCE =====

/**
 * GET /api/analytics/team-performance
 * Detailed team member performance metrics
 */
router.get('/team-performance', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { days = 30, sort_by = 'calls_handled' } = req.query;
    const daysInt = parseInt(days);

    const result = await withTimeout(async () => {
      let orderBy;
      if (sort_by === 'qa_score') orderBy = 'tm.qa_score DESC';
      else if (sort_by === 'resolution_rate') orderBy = 'resolution_rate DESC';
      else orderBy = 'calls_handled DESC';

      const query = `
        SELECT 
          tm.id,
          tm.name,
          tm.email,
          tm.qa_score,
          COUNT(c.id) as calls_handled,
          COUNT(CASE WHEN c.resolved = true THEN 1 END) as resolved_calls,
          ROUND(100.0 * COUNT(CASE WHEN c.resolved = true THEN 1 END) / COUNT(c.id), 2) as resolution_rate,
          AVG(EXTRACT(EPOCH FROM (c.ended_at - c.started_at))) as avg_duration_seconds,
          COUNT(c.id) FILTER (WHERE c.escalated = true) as escalated_count,
          COUNT(CASE WHEN qr.status = 'flagged' THEN 1 END) as flagged_reviews,
          MIN(c.created_at) as first_call,
          MAX(c.created_at) as last_call
        FROM team_members tm
        LEFT JOIN calls c ON tm.id = c.team_member_id AND c.client_id = $1 AND c.created_at > NOW() - INTERVAL '${daysInt} days'
        LEFT JOIN qa_reviews qr ON c.id = qr.call_id AND qr.created_at > NOW() - INTERVAL '${daysInt} days'
        WHERE tm.client_id = $1 AND tm.status = 'active'
        GROUP BY tm.id, tm.name, tm.email, tm.qa_score
        ORDER BY ${orderBy}
      `;

      const performance = await db.query(query, [client_id]);
      return performance.rows;
    }, 30000, 'team performance analytics');

    res.json({
      success: true,
      data: {
        period_days: daysInt,
        team_performance: result
      }
    });
  } catch (error) {
    logger.error('Team performance analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team performance'
    });
  }
});

// ===== CALL ANALYTICS =====

/**
 * GET /api/analytics/call-analytics
 * Detailed call statistics by sector, agent, time
 */
router.get('/call-analytics', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { days = 30, groupBy = 'sector' } = req.query;
    const daysInt = parseInt(days);

    const result = await withTimeout(async () => {
      let query;

      if (groupBy === 'sector') {
        query = `
          SELECT 
            sector,
            COUNT(*) as total_calls,
            COUNT(CASE WHEN resolved = true THEN 1 END) as resolved,
            ROUND(100.0 * COUNT(CASE WHEN resolved = true THEN 1 END) / COUNT(*), 2) as resolution_rate,
            AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_duration,
            COUNT(CASE WHEN escalated = true THEN 1 END) as escalations
          FROM calls 
          WHERE client_id = $1 AND created_at > NOW() - INTERVAL '${daysInt} days'
          GROUP BY sector
          ORDER BY total_calls DESC
        `;
      } else if (groupBy === 'hour_of_day') {
        query = `
          SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            COUNT(*) as total_calls,
            AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_duration,
            COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_count
          FROM calls 
          WHERE client_id = $1 AND created_at > NOW() - INTERVAL '${daysInt} days'
          GROUP BY EXTRACT(HOUR FROM created_at)
          ORDER BY hour ASC
        `;
      } else if (groupBy === 'day_of_week') {
        query = `
          SELECT 
            TO_CHAR(created_at, 'Day') as day_name,
            EXTRACT(DOW FROM created_at) as day_of_week,
            COUNT(*) as total_calls,
            AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_duration
          FROM calls 
          WHERE client_id = $1 AND created_at > NOW() - INTERVAL '${daysInt} days'
          GROUP BY day_of_week, TO_CHAR(created_at, 'Day')
          ORDER BY day_of_week ASC
        `;
      }

      const analytics = await db.query(query, [client_id]);
      return analytics.rows;
    }, 30000, 'call analytics');

    res.json({
      success: true,
      data: {
        groupBy,
        analytics: result
      }
    });
  } catch (error) {
    logger.error('Call analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch call analytics'
    });
  }
});

// ===== CUSTOM REPORTS =====

/**
 * POST /api/analytics/custom-report
 * Generate custom report with filters
 */
router.post('/custom-report', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { 
      report_type, // 'detailed_calls', 'team_summary', 'qa_report'
      filters = {},
      days = 30
    } = req.body;

    const result = await withTimeout(async () => {
      const daysInt = parseInt(days);
      let query, params = [client_id];

      if (report_type === 'detailed_calls') {
        query = `
          SELECT 
            c.id,
            c.phone_from,
            c.phone_to,
            c.team_member_id,
            tm.name as agent_name,
            c.sector,
            c.created_at,
            EXTRACT(EPOCH FROM (c.ended_at - c.started_at)) as duration_seconds,
            c.resolved,
            c.escalated,
            c.notes,
            qr.qa_score,
            qr.status as review_status
          FROM calls c
          LEFT JOIN team_members tm ON c.team_member_id = tm.id
          LEFT JOIN qa_reviews qr ON c.id = qr.call_id
          WHERE c.client_id = $1 AND c.created_at > NOW() - INTERVAL '${daysInt} days'
        `;

        if (filters.team_member_id) {
          query += ` AND c.team_member_id = $${params.length + 1}`;
          params.push(filters.team_member_id);
        }
        if (filters.sector) {
          query += ` AND c.sector = $${params.length + 1}`;
          params.push(filters.sector);
        }
        if (filters.resolved !== undefined) {
          query += ` AND c.resolved = $${params.length + 1}`;
          params.push(filters.resolved);
        }

        query += ` ORDER BY c.created_at DESC LIMIT 1000`;
      } else if (report_type === 'team_summary') {
        query = `
          SELECT 
            tm.id,
            tm.name,
            tm.email,
            tm.role,
            COUNT(c.id) as total_calls,
            COUNT(CASE WHEN c.resolved = true THEN 1 END) as resolved_calls,
            AVG(tm.qa_score) as avg_qa_score,
            COUNT(qr.id) as reviews_completed,
            COUNT(CASE WHEN qr.status = 'flagged' THEN 1 END) as flagged_reviews
          FROM team_members tm
          LEFT JOIN calls c ON tm.id = c.team_member_id AND c.created_at > NOW() - INTERVAL '${daysInt} days'
          LEFT JOIN qa_reviews qr ON c.id = qr.call_id
          WHERE tm.client_id = $1 AND tm.status = 'active'
          GROUP BY tm.id, tm.name, tm.email, tm.role
          ORDER BY total_calls DESC
        `;
      } else if (report_type === 'qa_report') {
        query = `
          SELECT 
            tm.name,
            COUNT(qr.id) as total_reviews,
            AVG(qr.qa_score) as avg_score,
            COUNT(CASE WHEN qr.status = 'flagged' THEN 1 END) as flagged_count,
            COUNT(CASE WHEN ca.status = 'active' THEN 1 END) as active_coaching,
            STRING_AGG(DISTINCT qf.category, ', ') as feedback_categories
          FROM qa_reviews qr
          JOIN team_members tm ON qr.supervisor_id = tm.id
          LEFT JOIN qa_feedback qf ON qr.call_id = qf.call_id
          LEFT JOIN coaching_assignments ca ON tm.id = ca.team_member_id
          WHERE qr.created_at > NOW() - INTERVAL '${daysInt} days'
          GROUP BY tm.name
          ORDER BY total_reviews DESC
        `;
      }

      const report = await db.query(query, params);
      return report.rows;
    }, 30000, 'custom report');

    res.json({
      success: true,
      data: {
        report_type,
        generated_at: new Date().toISOString(),
        rows: result,
        count: result.length
      }
    });
  } catch (error) {
    logger.error('Custom report generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate custom report'
    });
  }
});

// ===== EXPORT ANALYTICS =====

/**
 * GET /api/analytics/export/:format
 * Export analytics as CSV or JSON
 */
router.get('/export/:format', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { format } = req.params;
    const { days = 30, report_type = 'team_performance' } = req.query;
    const daysInt = parseInt(days);

    if (!['csv', 'json'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Use csv or json'
      });
    }

    const result = await withTimeout(async () => {
      let query;

      if (report_type === 'team_performance') {
        query = `
          SELECT 
            tm.id,
            tm.name,
            tm.email,
            COUNT(c.id) as calls_handled,
            ROUND(100.0 * COUNT(CASE WHEN c.resolved = true THEN 1 END) / NULLIF(COUNT(c.id), 0), 2) as resolution_rate,
            COALESCE(ROUND(AVG(tm.qa_score), 2), 0) as avg_qa_score
          FROM team_members tm
          LEFT JOIN calls c ON tm.id = c.team_member_id AND c.created_at > NOW() - INTERVAL '${daysInt} days'
          WHERE tm.client_id = $1 AND tm.status = 'active'
          GROUP BY tm.id, tm.name, tm.email
          ORDER BY calls_handled DESC
        `;
      } else if (report_type === 'calls') {
        query = `
          SELECT 
            c.id,
            c.phone_from,
            c.phone_to,
            tm.name as agent,
            c.sector,
            c.created_at,
            ROUND(EXTRACT(EPOCH FROM (c.ended_at - c.started_at)) / 60, 2) as duration_minutes,
            c.resolved,
            c.escalated
          FROM calls c
          LEFT JOIN team_members tm ON c.team_member_id = tm.id
          WHERE c.client_id = $1 AND c.created_at > NOW() - INTERVAL '${daysInt} days'
          ORDER BY c.created_at DESC
          LIMIT 5000
        `;
      }

      const data = await db.query(query, [client_id]);
      return data.rows;
    }, 30000, 'export analytics');

    if (format === 'json') {
      res.json({
        success: true,
        data: result,
        exported_at: new Date().toISOString()
      });
    } else {
      // CSV format
      const keys = Object.keys(result[0] || {});
      let csv = keys.join(',') + '\n';
      result.forEach(row => {
        csv += keys.map(k => JSON.stringify(row[k] || '')).join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="report-${Date.now()}.csv"`);
      res.send(csv);
    }
  } catch (error) {
    logger.error('Export analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export analytics'
    });
  }
});

module.exports = router;
