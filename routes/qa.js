/**
 * Backend/routes/qa.js - QA Workflow & Call Review Management
 * Supervisors can review calls, provide feedback, track QA metrics
 * Features: Call flagging, feedback submission, QA score calculation
 */

const express = require('express');
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));
const router = express.Router();

/**
 * Get calls for QA review (supervisor view)
 * Shows recent calls with performance metrics ready for review
 */
router.get('/calls-to-review', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { limit = 20, offset = 0, team_member_id, status } = req.query;

    // Base query - get recent calls with agent/team info
    let query = `
      SELECT 
        c.id, c.call_sid, c.phone_from, c.phone_to,
        c.created_at, c.end_ts, c.duration,
        c.team_member_id, c.agent_type, c.resolved, c.escalated,
        tm.title as team_member_name,
        COALESCE(
          json_agg(json_build_object(
            'id', qr.id,
            'status', qr.status,
            'qa_score', qr.qa_score,
            'feedback', qr.feedback
          )) FILTER (WHERE qr.id IS NOT NULL),
          '[]'::json
        ) as reviews
      FROM calls c
      LEFT JOIN team_members tm ON c.team_member_id = tm.id
      LEFT JOIN qa_reviews qr ON c.id = qr.call_id
      WHERE c.client_id = $1
    `;

    const params = [client_id];

    // Filter by team member if provided
    if (team_member_id) {
      query += ` AND c.team_member_id = $${params.length + 1}`;
      params.push(team_member_id);
    }

    // Filter by review status (pending, reviewed, flagged)
    if (status === 'pending') {
      query += ` AND qr.id IS NULL`;
    } else if (status === 'reviewed') {
      query += ` AND qr.id IS NOT NULL AND qr.status = 'completed'`;
    } else if (status === 'flagged') {
      query += ` AND qr.id IS NOT NULL AND qr.status = 'flagged'`;
    }

    query += `
      GROUP BY c.id, tm.title
      ORDER BY c.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    const result = await db.query(query, params);

    return res.json({
      success: true,
      data: result.rows,
      pagination: { limit: parseInt(limit), offset: parseInt(offset) },
      error: null
    });
  } catch (error) {
    logger.error('Error fetching calls for review', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message
    });
  }
});

/**
 * Get single call with full context for review
 * Includes transcript, metrics, and previous reviews
 */
router.get('/calls/:callId/review', async (req, res) => {
  try {
    const { callId } = req.params;
    const { client_id } = req.user;

    // Verify call belongs to client
    const callResult = await db.query(
      `SELECT c.* FROM calls c 
       WHERE c.id = $1 AND c.client_id = $2`,
      [callId, client_id]
    );

    if (callResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Call not found'
      });
    }

    const call = callResult.rows[0];

    // Get team member info
    const memberResult = await db.query(
      `SELECT id, title, performance_score, success_rate FROM team_members WHERE id = $1`,
      [call.team_member_id]
    );

    // Get all reviews for this call
    const reviewsResult = await db.query(
      `SELECT * FROM qa_reviews WHERE call_id = $1 ORDER BY created_at DESC`,
      [callId]
    );

    // Get feedback items
    const feedbackResult = await db.query(
      `SELECT * FROM qa_feedback WHERE call_id = $1 ORDER BY category`,
      [callId]
    );

    return res.json({
      success: true,
      data: {
        call,
        team_member: memberResult.rows[0] || null,
        reviews: reviewsResult.rows,
        feedback: feedbackResult.rows,
        feedback_categories: [
          'communication',
          'problem_solving',
          'product_knowledge',
          'empathy',
          'resolution',
          'efficiency',
          'compliance'
        ]
      },
      error: null
    });
  } catch (error) {
    logger.error('Error fetching call for review', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message
    });
  }
});

/**
 * Submit QA review for a call
 * Supervisor provides score, feedback, and coaching notes
 */
router.post('/calls/:callId/review', async (req, res) => {
  try {
    const { callId } = req.params;
    const { client_id, id: supervisor_id } = req.user;
    const {
      qa_score,           // 0-100
      status,             // 'completed' or 'flagged'
      feedback_text,      // Supervisor notes
      feedback_items,     // Array of {category, score, notes}
      coaching_needed,    // boolean
      coaching_topic      // string (if coaching_needed)
    } = req.body;

    // Validate inputs
    if (qa_score === undefined || qa_score < 0 || qa_score > 100) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'QA score must be between 0-100'
      });
    }

    // Verify call belongs to client
    const callResult = await db.query(
      `SELECT * FROM calls c WHERE c.id = $1 AND c.client_id = $2`,
      [callId, client_id]
    );

    if (callResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Call not found'
      });
    }

    const call = callResult.rows[0];

    // Create QA review record
    const reviewResult = await db.query(
      `INSERT INTO qa_reviews (call_id, supervisor_id, qa_score, status, feedback, coaching_needed, coaching_topic, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [callId, supervisor_id, qa_score, status || 'completed', feedback_text, coaching_needed || false, coaching_topic || null]
    );

    const review = reviewResult.rows[0];

    // Insert individual feedback items
    if (feedback_items && Array.isArray(feedback_items)) {
      for (const item of feedback_items) {
        await db.query(
          `INSERT INTO qa_feedback (call_id, category, score, notes)
           VALUES ($1, $2, $3, $4)`,
          [callId, item.category, item.score, item.notes || null]
        );
      }
    }

    // Update team member's QA score if this affects their overall performance
    if (call.team_member_id) {
      await updateTeamMemberQAScore(call.team_member_id);
    }

    logger.info('QA review submitted', {
      callId,
      supervisor_id,
      qa_score,
      status,
      team_member_id: call.team_member_id
    });

    return res.json({
      success: true,
      data: review,
      error: null
    });
  } catch (error) {
    logger.error('Error submitting QA review', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message
    });
  }
});

/**
 * Get QA metrics for team member
 * Shows review history, avg QA score, improvement areas
 */
router.get('/team-member/:memberId/qa-metrics', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { client_id } = req.user;

    // Verify team member belongs to client
    const memberResult = await db.query(
      `SELECT tm.* FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND t.client_id = $2`,
      [memberId, client_id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Team member not found'
      });
    }

    const member = memberResult.rows[0];

    // Get QA metrics
    const metricsResult = await db.query(
      `SELECT 
        COUNT(*) as total_reviews,
        ROUND(AVG(qa_score)::numeric, 1) as avg_qa_score,
        COUNT(CASE WHEN status = 'flagged' THEN 1 END) as flagged_reviews,
        COUNT(CASE WHEN coaching_needed THEN 1 END) as coaching_needed_count,
        ROUND(AVG(CASE WHEN status = 'completed' THEN qa_score END)::numeric, 1) as avg_completed_score,
        ROUND(AVG(CASE WHEN status = 'flagged' THEN qa_score END)::numeric, 1) as avg_flagged_score
       FROM qa_reviews qr
       JOIN calls c ON qr.call_id = c.id
       WHERE c.team_member_id = $1`,
      [memberId]
    );

    const metrics = metricsResult.rows[0];

    // Get feedback breakdown by category
    const feedbackResult = await db.query(
      `SELECT 
        category,
        COUNT(*) as count,
        ROUND(AVG(score)::numeric, 1) as avg_score
       FROM qa_feedback qf
       JOIN calls c ON qf.call_id = c.id
       WHERE c.team_member_id = $1
       GROUP BY category
       ORDER BY avg_score ASC`,
      [memberId]
    );

    // Get recent reviews
    const recentResult = await db.query(
      `SELECT qr.*, c.created_at as call_date
       FROM qa_reviews qr
       JOIN calls c ON qr.call_id = c.id
       WHERE c.team_member_id = $1
       ORDER BY c.created_at DESC
       LIMIT 10`,
      [memberId]
    );

    return res.json({
      success: true,
      data: {
        member,
        metrics,
        feedback_breakdown: feedbackResult.rows,
        recent_reviews: recentResult.rows
      },
      error: null
    });
  } catch (error) {
    logger.error('Error fetching QA metrics', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message
    });
  }
});

/**
 * Get coaching assignments for team member
 * Shows what areas need improvement and coaching plan
 */
router.get('/team-member/:memberId/coaching', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { client_id } = req.user;

    // Verify team member
    const memberResult = await db.query(
      `SELECT tm.* FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND t.client_id = $2`,
      [memberId, client_id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Team member not found'
      });
    }

    // Get coaching assignments
    const coachingResult = await db.query(
      `SELECT * FROM coaching_assignments
       WHERE team_member_id = $1
       ORDER BY created_at DESC`,
      [memberId]
    );

    // Get coaching progress
    const progressResult = await db.query(
      `SELECT 
        ca.id,
        ca.topic,
        ca.status,
        COUNT(cp.id) as session_count,
        ROUND(AVG(cp.progress_score)::numeric, 1) as avg_progress
       FROM coaching_assignments ca
       LEFT JOIN coaching_progress cp ON ca.id = cp.assignment_id
       WHERE ca.team_member_id = $1
       GROUP BY ca.id, ca.topic, ca.status`,
      [memberId]
    );

    return res.json({
      success: true,
      data: {
        member: memberResult.rows[0],
        coaching_assignments: coachingResult.rows,
        coaching_progress: progressResult.rows
      },
      error: null
    });
  } catch (error) {
    logger.error('Error fetching coaching data', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message
    });
  }
});

/**
 * Create coaching assignment for team member
 */
router.post('/team-member/:memberId/coaching', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { client_id, id: supervisor_id } = req.user;
    const { topic, description, target_date, priority } = req.body;

    // Verify team member
    const memberResult = await db.query(
      `SELECT tm.* FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND t.client_id = $2`,
      [memberId, client_id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Team member not found'
      });
    }

    // Create coaching assignment
    const result = await db.query(
      `INSERT INTO coaching_assignments 
        (team_member_id, supervisor_id, topic, description, target_date, priority, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())
       RETURNING *`,
      [memberId, supervisor_id, topic, description || null, target_date || null, priority || 'medium']
    );

    logger.info('Coaching assignment created', {
      team_member_id: memberId,
      supervisor_id,
      topic
    });

    return res.json({
      success: true,
      data: result.rows[0],
      error: null
    });
  } catch (error) {
    logger.error('Error creating coaching assignment', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message
    });
  }
});

/**
 * Log coaching session progress
 */
router.post('/coaching/:assignmentId/progress', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { client_id, id: supervisor_id } = req.user;
    const { session_date, topic_covered, progress_score, notes } = req.body;

    // Verify assignment
    const assignmentResult = await db.query(
      `SELECT ca.* FROM coaching_assignments ca
       JOIN team_members tm ON ca.team_member_id = tm.id
       JOIN teams t ON tm.team_id = t.id
       WHERE ca.id = $1 AND t.client_id = $2`,
      [assignmentId, client_id]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Coaching assignment not found'
      });
    }

    // Log progress
    const result = await db.query(
      `INSERT INTO coaching_progress 
        (assignment_id, supervisor_id, session_date, topic_covered, progress_score, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [assignmentId, supervisor_id, session_date || new Date(), topic_covered, progress_score, notes || null]
    );

    logger.info('Coaching progress logged', {
      assignment_id: assignmentId,
      supervisor_id,
      progress_score
    });

    return res.json({
      success: true,
      data: result.rows[0],
      error: null
    });
  } catch (error) {
    logger.error('Error logging coaching progress', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message
    });
  }
});

/**
 * Helper function to update team member's overall QA score
 * Recalculates based on recent reviews
 */
async function updateTeamMemberQAScore(memberId) {
  try {
    const result = await db.query(
      `SELECT ROUND(AVG(qa_score)::numeric, 1) as avg_qa_score,
              COUNT(*) as total_reviews
       FROM qa_reviews qr
       JOIN calls c ON qr.call_id = c.id
       WHERE c.team_member_id = $1
       AND qr.created_at > NOW() - INTERVAL '30 days'`,
      [memberId]
    );

    const { avg_qa_score, total_reviews } = result.rows[0];

    if (total_reviews > 0) {
      await db.query(
        `UPDATE team_members SET qa_score = $1 WHERE id = $2`,
        [avg_qa_score, memberId]
      );
    }
  } catch (error) {
    logger.warn('Failed to update QA score', { memberId, error: error.message });
  }
}

module.exports = router;
