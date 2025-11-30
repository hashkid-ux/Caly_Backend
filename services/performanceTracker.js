// Backend/services/performanceTracker.js - Real-time team member performance updates
// ✅ PHASE 8: Updates team member stats after each call execution

const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));

/**
 * Update team member performance after call completion
 * Called from agentRouter after AI agent executes
 *
 * @param {string} teamMemberId - ID of team member assigned to agent
 * @param {object} callResult - Result from AI agent execution
 *   - resolved: boolean
 *   - escalated: boolean
 *   - success: boolean
 *   - handling_time_seconds: number
 *   - customer_satisfaction: 1-5
 */
async function updateTeamMemberPerformance(teamMemberId, callResult) {
  try {
    if (!teamMemberId) {
      logger.debug('No team member to track for call');
      return;
    }

    const {
      resolved = false,
      escalated = false,
      success = false,
      handling_time_seconds = 0,
      customer_satisfaction = 3,
      agent_type = 'unknown'
    } = callResult;

    // Get current member stats
    const memberResult = await db.query(
      `SELECT 
        id, calls_total, success_rate, avg_rating,
        calls_this_week, performance_score
      FROM team_members
      WHERE id = $1`,
      [teamMemberId]
    );

    if (memberResult.rows.length === 0) {
      logger.warn('Team member not found for performance update', { teamMemberId });
      return;
    }

    const member = memberResult.rows[0];

    // Calculate new statistics
    const oldTotal = member.calls_total || 0;
    const newTotal = oldTotal + 1;
    const oldSuccessCount = Math.round((member.success_rate || 0) * oldTotal / 100);
    const newSuccessCount = oldSuccessCount + (success ? 1 : 0);
    const newSuccessRate = Math.round((newSuccessCount / newTotal) * 100);

    const oldRatingSum = (member.avg_rating || 0) * oldTotal;
    const newRatingSum = oldRatingSum + customer_satisfaction;
    const newAvgRating = newRatingSum / newTotal;

    // Calculate performance score (0-100)
    // Based on: success rate (60%), customer satisfaction (30%), responsiveness (10%)
    const performanceScore = Math.round(
      (newSuccessRate * 0.6) +
      ((newAvgRating / 5) * 100 * 0.3) +
      (Math.min(handling_time_seconds / 60, 10) / 10 * 100 * 0.1)
    );

    // Update team member main stats
    await db.query(
      `UPDATE team_members 
       SET 
        calls_total = $1,
        success_rate = $2,
        avg_rating = $3,
        calls_this_week = calls_this_week + 1,
        performance_score = $4,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [newTotal, newSuccessRate, newAvgRating, performanceScore, teamMemberId]
    );

    // Update agent-specific assignment stats
    if (agent_type !== 'unknown') {
      await db.query(
        `UPDATE team_agent_assignments 
         SET 
          calls_handled = calls_handled + 1,
          success_rate = success_rate + $1,
          avg_handling_time = (avg_handling_time + $2) / 2,
          last_used = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
         WHERE team_member_id = $3 AND agent_type = $4`,
        [success ? 1 : 0, handling_time_seconds, teamMemberId, agent_type]
      );
    }

    // Record daily performance aggregate
    await recordDailyPerformance(teamMemberId, {
      calls_handled: 1,
      success: success ? 1 : 0,
      escalated: escalated ? 1 : 0,
      customer_satisfaction,
      avg_handling_time: handling_time_seconds,
      performance_score: performanceScore
    });

    logger.info('Team member performance updated', {
      teamMemberId,
      newTotal,
      newSuccessRate,
      newAvgRating: newAvgRating.toFixed(2),
      performanceScore,
      agentType: agent_type,
    });

  } catch (error) {
    logger.error('Error updating team member performance', {
      teamMemberId,
      error: error.message
    });
  }
}

/**
 * Record daily performance aggregate for team member
 * Used for trend analysis and reporting
 */
async function recordDailyPerformance(teamMemberId, dailyStats) {
  try {
    const {
      calls_handled = 1,
      success = 0,
      escalated = 0,
      customer_satisfaction = 3,
      avg_handling_time = 0,
      performance_score = 0
    } = dailyStats;

    // Check if record exists for today
    const existingResult = await db.query(
      `SELECT id, calls_handled, success, escalated, avg_handling_time
       FROM team_performance
       WHERE team_member_id = $1 AND date = CURRENT_DATE`,
      [teamMemberId]
    );

    if (existingResult.rows.length > 0) {
      // Update existing daily record
      const existing = existingResult.rows[0];
      const updatedSuccess = existing.success + success;
      const updatedEscalated = existing.escalated + escalated;
      const updatedCalls = existing.calls_handled + calls_handled;
      const updatedAvgTime = (existing.avg_handling_time + avg_handling_time) / 2;
      const updatedSuccessRate = (updatedSuccess / updatedCalls) * 100;

      await db.query(
        `UPDATE team_performance
         SET 
          calls_handled = $1,
          success = $2,
          escalated = $3,
          avg_handling_time = $4,
          success_rate = $5,
          customer_satisfaction = $6,
          performance_score = $7,
          updated_at = CURRENT_TIMESTAMP
         WHERE team_member_id = $8 AND date = CURRENT_DATE`,
        [
          updatedCalls,
          updatedSuccess,
          updatedEscalated,
          updatedAvgTime,
          updatedSuccessRate,
          customer_satisfaction,
          performance_score,
          teamMemberId
        ]
      );
    } else {
      // Create new daily record
      const successRate = (success / calls_handled) * 100;
      const recordId = require('uuid').v4();

      await db.query(
        `INSERT INTO team_performance 
         (id, team_member_id, date, calls_handled, success, escalated, 
          avg_handling_time, success_rate, customer_satisfaction, performance_score)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9)`,
        [
          recordId,
          teamMemberId,
          calls_handled,
          success,
          escalated,
          avg_handling_time,
          successRate,
          customer_satisfaction,
          performance_score
        ]
      );
    }

    logger.debug('Daily performance recorded', {
      teamMemberId,
      callsHandled: calls_handled,
    });

  } catch (error) {
    logger.error('Error recording daily performance', {
      teamMemberId,
      error: error.message
    });
  }
}

/**
 * Get team member's performance data
 */
async function getTeamMemberPerformance(teamMemberId) {
  try {
    const result = await db.query(
      `SELECT 
        id, calls_total, success_rate, avg_rating,
        calls_this_week, performance_score,
        created_at, updated_at
      FROM team_members
      WHERE id = $1`,
      [teamMemberId]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error fetching team member performance', { error: error.message });
    return null;
  }
}

/**
 * Get team performance summary
 */
async function getTeamPerformanceSummary(teamId) {
  try {
    const result = await db.query(
      `SELECT 
        SUM(calls_total) as total_calls,
        AVG(success_rate) as avg_success_rate,
        AVG(avg_rating) as avg_customer_rating,
        COUNT(*) as member_count
      FROM team_members
      WHERE team_id = $1 AND active = true`,
      [teamId]
    );

    return result.rows[0] || {
      total_calls: 0,
      avg_success_rate: 0,
      avg_customer_rating: 0,
      member_count: 0
    };
  } catch (error) {
    logger.error('Error fetching team performance summary', { error: error.message });
    return null;
  }
}

/**
 * Get daily performance trend for team member (last N days)
 */
async function getPerformanceTrend(teamMemberId, days = 7) {
  try {
    const result = await db.query(
      `SELECT 
        date,
        calls_handled,
        success_rate,
        avg_handling_time,
        customer_satisfaction,
        performance_score
      FROM team_performance
      WHERE team_member_id = $1
        AND date >= CURRENT_DATE - INTERVAL '1 day' * $2
      ORDER BY date DESC`,
      [teamMemberId, days]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error fetching performance trend', { error: error.message });
    return [];
  }
}

/**
 * Reset weekly call counter for all team members
 * Should be called weekly (e.g., via cron job)
 */
async function resetWeeklyCallCounters() {
  try {
    await db.query(
      `UPDATE team_members SET calls_this_week = 0`
    );

    logger.info('Weekly call counters reset for all team members');
  } catch (error) {
    logger.error('Error resetting weekly counters', { error: error.message });
  }
}

module.exports = {
  updateTeamMemberPerformance,
  recordDailyPerformance,
  getTeamMemberPerformance,
  getTeamPerformanceSummary,
  getPerformanceTrend,
  resetWeeklyCallCounters,
};
