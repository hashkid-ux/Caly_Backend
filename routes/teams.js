// Backend/routes/teams.js - Team member management with agent assignment
const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const { authMiddleware } = require(resolve('auth/authMiddleware'));
const logger = require(resolve('utils/logger'));
const { v4: uuidv4 } = require('uuid');

// ✅ PHASE 8: Team Management - All routes require authentication & multi-tenancy
router.use(authMiddleware);

/**
 * GET /api/teams - List all team members for authenticated client
 * Returns: Array of team members with performance data
 */
router.get('/', async (req, res) => {
  try {
    const { client_id } = req.user;

    const result = await db.query(
      `SELECT 
        tm.id,
        tm.team_id,
        tm.user_id,
        u.email,
        tm.title,
        tm.role,
        tm.performance_score,
        tm.avg_rating,
        tm.calls_this_week,
        tm.calls_total,
        tm.success_rate,
        tm.active,
        tm.joined_at,
        tm.created_at,
        tm.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'agent_id', taa.id,
              'agent_type', taa.agent_type,
              'proficiency_level', taa.proficiency_level,
              'calls_handled', taa.calls_handled,
              'success_rate', taa.success_rate,
              'avg_handling_time', taa.avg_handling_time
            ) ORDER BY taa.agent_type
          ) FILTER (WHERE taa.id IS NOT NULL),
          '[]'::json
        ) as assigned_agents
      FROM team_members tm
      LEFT JOIN users u ON tm.user_id = u.id
      LEFT JOIN team_agent_assignments taa ON tm.id = taa.team_member_id
      WHERE tm.team_id IN (
        SELECT id FROM teams WHERE client_id = $1
      )
      GROUP BY tm.id, u.email
      ORDER BY tm.created_at DESC`,
      [client_id]
    );

    logger.info('Team members fetched', {
      client_id,
      count: result.rows.length,
    });

    return res.json({
      success: true,
      data: result.rows,
      error: null
    });
  } catch (error) {
    logger.error('Error fetching team members', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Failed to fetch team members'
    });
  }
});

/**
 * POST /api/teams/members - Create new team member
 * Body: { name, email, role, primary_sector, team_id? }
 * Returns: Created team member object
 */
router.post('/members', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { name, email, role, primary_sector, team_id } = req.body;

    // Validation
    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Missing required fields: name, email, role'
      });
    }

    if (!['lead', 'senior', 'member', 'trainee'].includes(role)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Invalid role. Must be: lead, senior, member, trainee'
      });
    }

    // Find or create user
    let user_id;
    const userCheck = await db.query(
      'SELECT id FROM users WHERE email = $1 AND client_id = $2',
      [email, client_id]
    );

    if (userCheck.rows.length > 0) {
      user_id = userCheck.rows[0].id;
    } else {
      // Create new user (internal team member)
      user_id = uuidv4();
      await db.query(
        `INSERT INTO users (id, client_id, email, name, role, is_active)
         VALUES ($1, $2, $3, $4, 'team_member', true)`,
        [user_id, client_id, email, name]
      );
    }

    // Get or create default team for this client
    let effectiveTeamId = team_id;
    if (!team_id) {
      const teamCheck = await db.query(
        `SELECT id FROM teams WHERE client_id = $1 LIMIT 1`,
        [client_id]
      );

      if (teamCheck.rows.length === 0) {
        // Create default team
        effectiveTeamId = uuidv4();
        await db.query(
          `INSERT INTO teams (id, client_id, name, sector, status)
           VALUES ($1, $2, 'Default Team', 'general', 'active')`,
          [effectiveTeamId, client_id]
        );
      } else {
        effectiveTeamId = teamCheck.rows[0].id;
      }
    }

    // Verify team belongs to client
    const teamVerify = await db.query(
      'SELECT client_id FROM teams WHERE id = $1',
      [effectiveTeamId]
    );

    if (teamVerify.rows.length === 0 || teamVerify.rows[0].client_id !== client_id) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Access denied - team not found'
      });
    }

    // Create team member
    const memberId = uuidv4();
    const result = await db.query(
      `INSERT INTO team_members 
       (id, team_id, user_id, title, role, active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING 
        id, team_id, user_id, title, role, performance_score,
        avg_rating, calls_this_week, calls_total, success_rate,
        active, joined_at, created_at, updated_at`,
      [memberId, effectiveTeamId, user_id, name, role]
    );

    logger.info('Team member created', {
      client_id,
      memberId: result.rows[0].id,
      email,
      role,
    });

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      error: null
    });
  } catch (error) {
    logger.error('Error creating team member', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Failed to create team member'
    });
  }
});

/**
 * GET /api/teams/members/:memberId - Get specific team member with assignments
 */
router.get('/members/:memberId', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { memberId } = req.params;

    // Verify member belongs to client's team
    const result = await db.query(
      `SELECT 
        tm.id,
        tm.team_id,
        tm.user_id,
        u.email,
        tm.title,
        tm.role,
        tm.performance_score,
        tm.avg_rating,
        tm.calls_this_week,
        tm.calls_total,
        tm.success_rate,
        tm.active,
        tm.joined_at,
        t.sector as primary_sector
      FROM team_members tm
      LEFT JOIN users u ON tm.user_id = u.id
      LEFT JOIN teams t ON tm.team_id = t.id
      WHERE tm.id = $1 AND t.client_id = $2`,
      [memberId, client_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Team member not found'
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      error: null
    });
  } catch (error) {
    logger.error('Error fetching team member', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Failed to fetch team member'
    });
  }
});

/**
 * PUT /api/teams/members/:memberId - Update team member
 */
router.put('/members/:memberId', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { memberId } = req.params;
    const { title, role, active } = req.body;

    // Verify ownership
    const memberCheck = await db.query(
      `SELECT tm.id FROM team_members tm
       LEFT JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND t.client_id = $2`,
      [memberId, client_id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Access denied'
      });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount}`);
      values.push(title);
      paramCount++;
    }

    if (role !== undefined) {
      if (!['lead', 'senior', 'member', 'trainee'].includes(role)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: 'Invalid role'
        });
      }
      updates.push(`role = $${paramCount}`);
      values.push(role);
      paramCount++;
    }

    if (active !== undefined) {
      updates.push(`active = $${paramCount}`);
      values.push(active);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(memberId);

    const result = await db.query(
      `UPDATE team_members 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    logger.info('Team member updated', {
      client_id,
      memberId,
    });

    return res.json({
      success: true,
      data: result.rows[0],
      error: null
    });
  } catch (error) {
    logger.error('Error updating team member', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Failed to update team member'
    });
  }
});

/**
 * DELETE /api/teams/members/:memberId - Soft delete team member (set inactive)
 */
router.delete('/members/:memberId', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { memberId } = req.params;

    // Verify ownership
    const memberCheck = await db.query(
      `SELECT tm.id FROM team_members tm
       LEFT JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND t.client_id = $2`,
      [memberId, client_id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Access denied'
      });
    }

    // Soft delete - set inactive
    await db.query(
      `UPDATE team_members SET active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [memberId]
    );

    logger.info('Team member deactivated', {
      client_id,
      memberId,
    });

    return res.json({
      success: true,
      data: { id: memberId, active: false },
      error: null
    });
  } catch (error) {
    logger.error('Error deleting team member', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Failed to delete team member'
    });
  }
});

/**
 * PUT /api/teams/members/:memberId/agents - Assign/update AI agents for team member
 * Body: { assignments: [{ agent_type, proficiency_level: 0-100 }] }
 */
router.put('/members/:memberId/agents', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { memberId } = req.params;
    const { assignments } = req.body;

    if (!Array.isArray(assignments)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'assignments must be an array'
      });
    }

    // Verify member belongs to client
    const memberCheck = await db.query(
      `SELECT tm.id, tm.team_id FROM team_members tm
       LEFT JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND t.client_id = $2`,
      [memberId, client_id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Access denied'
      });
    }

    const teamId = memberCheck.rows[0].team_id;

    // Clear existing assignments
    await db.query(
      'DELETE FROM team_agent_assignments WHERE team_member_id = $1',
      [memberId]
    );

    // Insert new assignments
    const insertedAssignments = [];
    for (const assignment of assignments) {
      const { agent_type, proficiency_level = 50 } = assignment;

      if (!agent_type) {
        continue;
      }

      if (proficiency_level < 0 || proficiency_level > 100) {
        return res.status(400).json({
          success: false,
          data: null,
          error: 'proficiency_level must be between 0-100'
        });
      }

      const assignId = uuidv4();
      await db.query(
        `INSERT INTO team_agent_assignments 
         (id, team_member_id, agent_type, proficiency_level)
         VALUES ($1, $2, $3, $4)`,
        [assignId, memberId, agent_type, proficiency_level]
      );

      insertedAssignments.push({
        id: assignId,
        agent_type,
        proficiency_level,
      });
    }

    logger.info('Agent assignments updated', {
      client_id,
      memberId,
      count: insertedAssignments.length,
    });

    return res.json({
      success: true,
      data: {
        team_member_id: memberId,
        assignments: insertedAssignments
      },
      error: null
    });
  } catch (error) {
    logger.error('Error assigning agents', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Failed to assign agents'
    });
  }
});

/**
 * GET /api/teams/members/:memberId/assignments - Get agent assignments for member
 */
router.get('/members/:memberId/assignments', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { memberId } = req.params;

    // Verify member belongs to client
    const memberCheck = await db.query(
      `SELECT tm.id FROM team_members tm
       LEFT JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND t.client_id = $2`,
      [memberId, client_id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Access denied'
      });
    }

    const result = await db.query(
      `SELECT 
        id,
        agent_type,
        proficiency_level,
        calls_handled,
        success_rate,
        avg_handling_time,
        last_used
      FROM team_agent_assignments
      WHERE team_member_id = $1
      ORDER BY agent_type`,
      [memberId]
    );

    return res.json({
      success: true,
      data: result.rows,
      error: null
    });
  } catch (error) {
    logger.error('Error fetching assignments', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Failed to fetch assignments'
    });
  }
});

/**
 * GET /api/teams/members/:memberId/performance - Get performance stats
 */
router.get('/members/:memberId/performance', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { memberId } = req.params;

    // Verify member belongs to client
    const memberCheck = await db.query(
      `SELECT tm.id FROM team_members tm
       LEFT JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND t.client_id = $2`,
      [memberId, client_id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Access denied'
      });
    }

    // Member overall stats
    const memberStats = await db.query(
      `SELECT 
        id, title, role, performance_score, avg_rating,
        calls_this_week, calls_total, success_rate
      FROM team_members
      WHERE id = $1`,
      [memberId]
    );

    // Agent-specific performance
    const agentStats = await db.query(
      `SELECT 
        agent_type,
        proficiency_level,
        calls_handled,
        success_rate,
        avg_handling_time,
        last_used
      FROM team_agent_assignments
      WHERE team_member_id = $1
      ORDER BY calls_handled DESC`,
      [memberId]
    );

    // Daily performance trend (last 7 days)
    const dailyStats = await db.query(
      `SELECT 
        date,
        calls_handled,
        success_rate,
        avg_handling_time,
        customer_satisfaction
      FROM team_performance
      WHERE team_member_id = $1
        AND date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY date DESC`,
      [memberId]
    );

    return res.json({
      success: true,
      data: {
        member: memberStats.rows[0],
        agents: agentStats.rows,
        daily_trend: dailyStats.rows,
      },
      error: null
    });
  } catch (error) {
    logger.error('Error fetching performance', { error: error.message });
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Failed to fetch performance'
    });
  }
});

module.exports = router;
