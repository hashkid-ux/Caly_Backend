/**
 * Teams Routes - Team management and agent assignment
 * Handles: team CRUD, member management, agent assignment, performance tracking
 * Multi-tenant: All operations filtered by client_id from JWT token
 */

const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));
const { authMiddleware } = require(resolve('auth/authMiddleware'));

// Apply authentication to all routes
router.use(authMiddleware);

// ============ GET OPERATIONS ============

/**
 * GET /api/teams
 * Get all teams for the user's company
 */
router.get('/', async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const { sector, status } = req.query;

    let query = `SELECT t.*, COUNT(DISTINCT tm.id) as member_count 
                FROM teams t 
                LEFT JOIN team_members tm ON t.id = tm.team_id 
                WHERE t.client_id = $1`;
    const params = [clientId];
    let paramCount = 2;

    if (sector) {
      query += ` AND t.sector = $${paramCount}`;
      params.push(sector);
      paramCount++;
    }

    if (status) {
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` GROUP BY t.id ORDER BY t.created_at DESC`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows || [],
      count: result.rows.length
    });

  } catch (error) {
    logger.error('Error fetching teams', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch teams' });
  }
});

/**
 * GET /api/teams/:id
 * Get team details with members and performance metrics
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = req.user.client_id;

    // Fetch team
    const teamResult = await db.query(
      `SELECT * FROM teams WHERE id = $1 AND client_id = $2`,
      [id, clientId]
    );

    if (!teamResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    const team = teamResult.rows[0];

    // Fetch team members with agent assignments
    const membersResult = await db.query(
      `SELECT tm.*, COUNT(DISTINCT taa.id) as agent_count
       FROM team_members tm
       LEFT JOIN team_agent_assignments taa ON tm.id = taa.team_member_id
       WHERE tm.team_id = $1
       GROUP BY tm.id
       ORDER BY tm.created_at ASC`,
      [id]
    );

    // Fetch today's performance
    const perfResult = await db.query(
      `SELECT * FROM team_performance 
       WHERE team_id = $1 AND date = CURRENT_DATE`,
      [id]
    );

    res.json({
      success: true,
      data: {
        team,
        members: membersResult.rows || [],
        performance: perfResult.rows[0] || null
      }
    });

  } catch (error) {
    logger.error('Error fetching team details', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch team details' });
  }
});

/**
 * GET /api/teams/:id/members
 * Get team members with their agent assignments
 */
router.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = req.user.client_id;

    // Verify team belongs to client
    const verify = await db.query(
      'SELECT id FROM teams WHERE id = $1 AND client_id = $2',
      [id, clientId]
    );

    if (!verify.rows.length) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    // Get members with their assignments
    const result = await db.query(
      `SELECT tm.*, json_agg(json_build_object(
        'id', taa.id,
        'agent_type', taa.agent_type,
        'proficiency_level', taa.proficiency_level,
        'success_rate', taa.success_rate
       )) as agents
       FROM team_members tm
       LEFT JOIN team_agent_assignments taa ON tm.id = taa.team_member_id
       WHERE tm.team_id = $1
       GROUP BY tm.id
       ORDER BY tm.created_at ASC`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows || []
    });

  } catch (error) {
    logger.error('Error fetching team members', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch team members' });
  }
});

/**
 * GET /api/teams/:id/performance
 * Get team performance metrics for date range
 */
router.get('/:id/performance', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = req.user.client_id;
    const { days = 30 } = req.query;

    // Verify team belongs to client
    const verify = await db.query(
      'SELECT id FROM teams WHERE id = $1 AND client_id = $2',
      [id, clientId]
    );

    if (!verify.rows.length) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    // Get performance metrics
    const result = await db.query(
      `SELECT * FROM team_performance 
       WHERE team_id = $1 AND date >= CURRENT_DATE - INTERVAL '${days} days'
       ORDER BY date DESC`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows || []
    });

  } catch (error) {
    logger.error('Error fetching team performance', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch team performance' });
  }
});

// ============ POST/CREATE OPERATIONS ============

/**
 * POST /api/teams
 * Create a new team
 */
router.post('/', async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const { name, sector, description, lead_id } = req.body;

    if (!name || !sector) {
      return res.status(400).json({ success: false, error: 'Name and sector required' });
    }

    const result = await db.query(
      `INSERT INTO teams (client_id, name, sector, description, lead_id, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING *`,
      [clientId, name, sector, description, lead_id || null]
    );

    logger.info('Team created', { clientId, teamId: result.rows[0].id });

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error creating team', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create team' });
  }
});

/**
 * POST /api/teams/:id/members
 * Add member to team
 */
router.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = req.user.client_id;
    const { user_id, title, role } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, error: 'user_id required' });
    }

    // Verify team belongs to client
    const verify = await db.query(
      'SELECT id FROM teams WHERE id = $1 AND client_id = $2',
      [id, clientId]
    );

    if (!verify.rows.length) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    const result = await db.query(
      `INSERT INTO team_members (team_id, user_id, title, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (team_id, user_id) DO UPDATE SET
        title = $3,
        role = $4,
        updated_at = NOW()
       RETURNING *`,
      [id, user_id, title || null, role || 'member']
    );

    logger.info('Team member added', { teamId: id, userId: user_id });

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error adding team member', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to add team member' });
  }
});

/**
 * POST /api/teams/:id/agents
 * Assign agents to a team member
 */
router.post('/:id/agents', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = req.user.client_id;
    const { team_member_id, agent_type, proficiency_level } = req.body;

    if (!team_member_id || !agent_type) {
      return res.status(400).json({ success: false, error: 'team_member_id and agent_type required' });
    }

    // Verify team member belongs to this team and client
    const verify = await db.query(
      `SELECT tm.id FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND tm.team_id = $2 AND t.client_id = $3`,
      [team_member_id, id, clientId]
    );

    if (!verify.rows.length) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    const result = await db.query(
      `INSERT INTO team_agent_assignments (team_member_id, agent_type, proficiency_level)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_member_id, agent_type) DO UPDATE SET
        proficiency_level = $3,
        updated_at = NOW()
       RETURNING *`,
      [team_member_id, agent_type, proficiency_level || 80]
    );

    logger.info('Agent assigned', { teamId: id, agentType: agent_type });

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error assigning agent', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to assign agent' });
  }
});

// ============ PUT/UPDATE OPERATIONS ============

/**
 * PUT /api/teams/:id
 * Update team information
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = req.user.client_id;
    const { name, description, status, lead_id } = req.body;

    // Verify team belongs to client
    const verify = await db.query(
      'SELECT id FROM teams WHERE id = $1 AND client_id = $2',
      [id, clientId]
    );

    if (!verify.rows.length) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    const result = await db.query(
      `UPDATE teams SET 
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        status = COALESCE($4, status),
        lead_id = COALESCE($5, lead_id),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [id, name, description, status, lead_id]
    );

    logger.info('Team updated', { teamId: id });

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error updating team', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update team' });
  }
});

/**
 * PUT /api/teams/:id/members/:memberId
 * Update team member information
 */
router.put('/:id/members/:memberId', async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const clientId = req.user.client_id;
    const { title, role, performance_score } = req.body;

    // Verify member belongs to this team and client
    const verify = await db.query(
      `SELECT tm.id FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND tm.team_id = $2 AND t.client_id = $3`,
      [memberId, id, clientId]
    );

    if (!verify.rows.length) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    const result = await db.query(
      `UPDATE team_members SET 
        title = COALESCE($2, title),
        role = COALESCE($3, role),
        performance_score = COALESCE($4, performance_score),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [memberId, title, role, performance_score]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error updating team member', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update team member' });
  }
});

// ============ DELETE OPERATIONS ============

/**
 * DELETE /api/teams/:id
 * Soft delete a team (set status to inactive)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = req.user.client_id;

    // Verify team belongs to client
    const verify = await db.query(
      'SELECT id FROM teams WHERE id = $1 AND client_id = $2',
      [id, clientId]
    );

    if (!verify.rows.length) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    await db.query(
      'UPDATE teams SET status = $1, updated_at = NOW() WHERE id = $2',
      ['inactive', id]
    );

    logger.info('Team deleted', { teamId: id });

    res.json({
      success: true,
      message: 'Team deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting team', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete team' });
  }
});

/**
 * DELETE /api/teams/:id/members/:memberId
 * Remove member from team
 */
router.delete('/:id/members/:memberId', async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const clientId = req.user.client_id;

    // Verify member belongs to this team and client
    const verify = await db.query(
      `SELECT tm.id FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.id = $1 AND tm.team_id = $2 AND t.client_id = $3`,
      [memberId, id, clientId]
    );

    if (!verify.rows.length) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    // Delete member and cascade to agent assignments
    await db.query(
      'DELETE FROM team_members WHERE id = $1',
      [memberId]
    );

    logger.info('Team member removed', { teamId: id, memberId });

    res.json({
      success: true,
      message: 'Team member removed successfully'
    });

  } catch (error) {
    logger.error('Error removing team member', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to remove team member' });
  }
});

/**
 * DELETE /api/teams/:id/agents/:assignmentId
 * Unassign agent from team member
 */
router.delete('/:id/agents/:assignmentId', async (req, res) => {
  try {
    const { id, assignmentId } = req.params;
    const clientId = req.user.client_id;

    // Verify assignment belongs to this team and client
    const verify = await db.query(
      `SELECT taa.id FROM team_agent_assignments taa
       JOIN team_members tm ON taa.team_member_id = tm.id
       JOIN teams t ON tm.team_id = t.id
       WHERE taa.id = $1 AND t.id = $2 AND t.client_id = $3`,
      [assignmentId, id, clientId]
    );

    if (!verify.rows.length) {
      return res.status(404).json({ success: false, error: 'Agent assignment not found' });
    }

    await db.query(
      'DELETE FROM team_agent_assignments WHERE id = $1',
      [assignmentId]
    );

    logger.info('Agent unassigned', { teamId: id });

    res.json({
      success: true,
      message: 'Agent unassigned successfully'
    });

  } catch (error) {
    logger.error('Error unassigning agent', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to unassign agent' });
  }
});

module.exports = router;
