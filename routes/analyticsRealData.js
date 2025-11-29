const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth/authMiddleware');
const db = require('../db');

/**
 * Analytics Routes - REAL DATA from Database
 * All numbers come from calls, actions, team_performance tables
 * NO mock data, NO hardcoded values
 */

/**
 * GET /api/analytics/kpis
 * Real Key Performance Indicators
 * Query: ?clientId={id}&sector={sector}&days=7|30|90
 */
router.get('/kpis', authMiddleware, async (req, res) => {
  try {
    const { clientId, sector, days = 7 } = req.query;

    // Verify client ownership
    if (req.user.client_id !== clientId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const dateFilter = days ? `AND DATE(c.start_ts) >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY)` : '';
    const sectorFilter = sector ? `AND c.sector = '${sector}'` : '';

    // Query 1: Today's calls (today only)
    const todayMetrics = await db.query(`
      SELECT 
        COUNT(*) as calls_today,
        AVG(c.duration_seconds) as avg_duration_today,
        SUM(CASE WHEN c.resolved = true THEN 1 ELSE 0 END) as completed_today,
        SUM(CASE WHEN c.resolved = false THEN 1 ELSE 0 END) as failed_today
      FROM calls c
      WHERE c.client_id = ? AND DATE(c.start_ts) = DATE(NOW()) ${sectorFilter}
    `, [clientId]);

    // Query 2: Period metrics (last 7/30/90 days)
    const periodMetrics = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        AVG(c.duration_seconds) as avg_duration,
        SUM(CASE WHEN c.resolved = true THEN 1 ELSE 0 END) as completed_calls,
        SUM(CASE WHEN c.resolved = false THEN 1 ELSE 0 END) as failed_calls,
        AVG(c.customer_satisfaction) as avg_satisfaction
      FROM calls c
      WHERE c.client_id = ? ${dateFilter} ${sectorFilter}
    `, [clientId]);

    // Query 3: Escalations
    const escalations = await db.query(`
      SELECT COUNT(*) as escalation_count
      FROM actions a
      JOIN calls c ON a.call_id = c.id
      WHERE c.client_id = ? AND a.action_type = 'escalate' 
      AND DATE(a.created_at) >= DATE_SUB(NOW(), INTERVAL ${days} DAY) ${sectorFilter}
    `, [clientId]);

    // Query 4: Top agents (by success rate)
    const topAgents = await db.query(`
      SELECT 
        a.agent_type as agent_name,
        COUNT(DISTINCT a.call_id) as calls_handled,
        SUM(CASE WHEN a.status = 'success' THEN 1 ELSE 0 END) as successful_actions,
        ROUND(SUM(CASE WHEN a.status = 'success' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as success_rate
      FROM actions a
      JOIN calls c ON a.call_id = c.id
      WHERE c.client_id = ? AND DATE(c.start_ts) >= DATE_SUB(NOW(), INTERVAL ${days} DAY) ${sectorFilter}
      GROUP BY a.agent_type
      ORDER BY success_rate DESC
      LIMIT 5
    `, [clientId]);

    // Query 5: Sector breakdown (pie chart data)
    const sectorBreakdown = await db.query(`
      SELECT 
        sector,
        COUNT(*) as call_count,
        ROUND(COUNT(*) / (SELECT COUNT(*) FROM calls WHERE client_id = ?) * 100, 1) as percentage
      FROM calls
      WHERE client_id = ? AND DATE(start_ts) >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
      GROUP BY sector
      ORDER BY call_count DESC
    `, [clientId, clientId]);

    // Query 6: Call outcomes (donut chart)
    const outcomes = await db.query(`
      SELECT 
        CASE 
          WHEN resolved = true AND customer_satisfaction >= 4 THEN 'Successful'
          WHEN resolved = true AND customer_satisfaction < 4 THEN 'Escalated'
          WHEN resolved = false THEN 'Failed'
          ELSE 'Pending'
        END as outcome,
        COUNT(*) as count,
        ROUND(COUNT(*) / (SELECT COUNT(*) FROM calls WHERE client_id = ?) * 100, 1) as percentage
      FROM calls
      WHERE client_id = ? AND DATE(start_ts) >= DATE_SUB(NOW(), INTERVAL ${days} DAY) ${sectorFilter}
      GROUP BY outcome
    `, [clientId, clientId]);

    // Query 7: Hourly trend (last 24 hours)
    const hourlyTrend = await db.query(`
      SELECT 
        HOUR(start_ts) as hour,
        DATE(start_ts) as date,
        COUNT(*) as calls,
        AVG(duration_seconds) as avg_duration
      FROM calls
      WHERE client_id = ? AND start_ts >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ${sectorFilter}
      GROUP BY HOUR(start_ts), DATE(start_ts)
      ORDER BY date DESC, hour DESC
    `, [clientId]);

    // Query 8: Daily trend (last 30 days)
    const dailyTrend = await db.query(`
      SELECT 
        DATE(start_ts) as date,
        COUNT(*) as calls,
        AVG(duration_seconds) as avg_duration,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as completed
      FROM calls
      WHERE client_id = ? AND start_ts >= DATE_SUB(NOW(), INTERVAL 30 DAY) ${sectorFilter}
      GROUP BY DATE(start_ts)
      ORDER BY date DESC
    `, [clientId]);

    // Calculate completion rate
    const completionRate = periodMetrics[0].total_calls > 0 
      ? ((periodMetrics[0].completed_calls / periodMetrics[0].total_calls) * 100).toFixed(1)
      : 0;

    // Calculate error rate
    const errorRate = periodMetrics[0].total_calls > 0
      ? ((periodMetrics[0].failed_calls / periodMetrics[0].total_calls) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        // Today's metrics
        callsToday: todayMetrics[0]?.calls_today || 0,
        avgDurationToday: (todayMetrics[0]?.avg_duration_today || 0).toFixed(1),
        completedToday: todayMetrics[0]?.completed_today || 0,
        failedToday: todayMetrics[0]?.failed_today || 0,

        // Period metrics
        totalCalls: periodMetrics[0]?.total_calls || 0,
        avgDuration: (periodMetrics[0]?.avg_duration || 0).toFixed(1),
        completionRate: parseFloat(completionRate),
        errorRate: parseFloat(errorRate),
        avgSatisfaction: (periodMetrics[0]?.avg_satisfaction || 0).toFixed(1),

        // Escalations
        escalations: escalations[0]?.escalation_count || 0,

        // Agent performance
        topAgents: topAgents.map(agent => ({
          name: agent.agent_name,
          calls: agent.calls_handled,
          successRate: agent.success_rate || 0,
          successful: agent.successful_actions
        })),

        // Charts
        sectorBreakdown: sectorBreakdown.map(s => ({
          sector: s.sector,
          value: s.call_count,
          percentage: s.percentage
        })),

        outcomes: outcomes.map(o => ({
          name: o.outcome,
          value: o.count,
          percentage: o.percentage
        })),

        hourlyTrend: hourlyTrend.map(h => ({
          hour: `${String(h.hour).padStart(2, '0')}:00`,
          calls: h.calls,
          avgDuration: h.avg_duration
        })),

        dailyTrend: dailyTrend.map(d => ({
          date: new Date(d.date).toLocaleDateString(),
          calls: d.calls,
          completed: d.completed,
          avgDuration: d.avg_duration
        }))
      },
      meta: {
        timeRange: `${days} days`,
        sector: sector || 'all',
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching analytics KPIs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/summary
 * Quick summary for dashboard widgets
 */
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.query;

    if (req.user.client_id !== clientId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const summary = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(DISTINCT DATE(start_ts)) as active_days,
        AVG(customer_satisfaction) as avg_satisfaction,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as resolved_calls
      FROM calls
      WHERE client_id = ? AND start_ts >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `, [clientId]);

    res.json({
      success: true,
      data: {
        totalCalls: summary[0]?.total_calls || 0,
        activeDays: summary[0]?.active_days || 0,
        avgSatisfaction: (summary[0]?.avg_satisfaction || 0).toFixed(1),
        resolvedCalls: summary[0]?.resolved_calls || 0
      }
    });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
