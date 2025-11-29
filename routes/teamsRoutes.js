const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth/authMiddleware');
const db = require('../db');

/**
 * Teams Management API Routes
 * - CRUD operations for teams
 * - Team member management
 * - Agent assignments
 * - Performance tracking
 */

// ============================================
// GET ENDPOINTS
// ============================================

/**
 * GET /api/teams
 * Get all teams with optional filtering
 * Query: ?sector=healthcare&status=active
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { sector, status } = req.query;
    let query = 'SELECT t.*, COUNT(DISTINCT tm.id) as member_count, AVG(tp.avg_rating) as avg_rating FROM teams t LEFT JOIN team_members tm ON t.id = tm.team_id LEFT JOIN team_performance tp ON t.id = tp.team_id WHERE 1=1';
    const params = [];

    if (sector) {
      query += ' AND t.sector = ?';
      params.push(sector);
    }

    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }

    query += ' GROUP BY t.id ORDER BY t.created_at DESC';

    const teams = await db.query(query, params);

    res.json({
      success: true,
      data: teams,
      count: teams.length
    });
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/teams/:id
 * Get team details with members and agents
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Get team basic info
    const team = await db.query(
      'SELECT * FROM teams WHERE id = ?',
      [id]
    );

    if (team.length === 0) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    // Get team members
    const members = await db.query(
      'SELECT tm.*, COUNT(DISTINCT ta.id) as agent_count FROM team_members tm LEFT JOIN team_agent_assignments ta ON tm.id = ta.team_member_id WHERE tm.team_id = ? GROUP BY tm.id',
      [id]
    );

    // Get team performance
    const performance = await db.query(
      'SELECT * FROM team_performance WHERE team_id = ? ORDER BY date DESC LIMIT 30',
      [id]
    );

    res.json({
      success: true,
      data: {
        ...team[0],
        members,
        performance
      }
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/teams/:id/members
 * Get all members in a team with their agent assignments
 */
router.get('/:id/members', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const members = await db.query(
      `SELECT tm.*, 
              GROUP_CONCAT(DISTINCT ta.agent_id) as assigned_agents,
              AVG(tp.performance_score) as avg_performance
       FROM team_members tm
       LEFT JOIN team_agent_assignments ta ON tm.id = ta.team_member_id
       LEFT JOIN team_performance tp ON tm.id = tp.team_member_id
       WHERE tm.team_id = ?
       GROUP BY tm.id`,
      [id]
    );

    res.json({
      success: true,
      data: members
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/teams/:id/performance
 * Get team performance metrics and trends
 */
router.get('/:id/performance', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;

    const performance = await db.query(
      `SELECT * FROM team_performance 
       WHERE team_id = ? AND date >= DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY date DESC`,
      [id, parseInt(days)]
    );

    // Calculate trends
    const trends = {
      success_rate: performance.length > 1 ? performance[0].success_rate - performance[performance.length - 1].success_rate : 0,
      avg_rating: performance.length > 1 ? performance[0].avg_rating - performance[performance.length - 1].avg_rating : 0,
      utilization: performance.length > 1 ? performance[0].utilization - performance[performance.length - 1].utilization : 0
    };

    res.json({
      success: true,
      data: {
        metrics: performance,
        trends
      }
    });
  } catch (error) {
    console.error('Error fetching team performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// POST ENDPOINTS
// ============================================

/**
 * POST /api/teams
 * Create a new team
 * Body: { name, sector, lead_id, description }
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, sector, lead_id, description } = req.body;

    // Validate required fields
    if (!name || !sector || !lead_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, sector, lead_id'
      });
    }

    // Validate sector
    const validSectors = ['healthcare', 'ecommerce', 'logistics', 'fintech', 'support', 'telecom', 'realestate', 'government', 'education', 'travel', 'saas'];
    if (!validSectors.includes(sector)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sector. Allowed: ${validSectors.join(', ')}`
      });
    }

    const result = await db.query(
      'INSERT INTO teams (name, sector, lead_id, description, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [name, sector, lead_id, description || '', 'active']
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        name,
        sector,
        lead_id,
        description,
        status: 'active',
        created_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/teams/:id/members
 * Add a member to a team
 * Body: { user_id, title, role }
 */
router.post('/:id/members', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, title, role } = req.body;

    if (!user_id || !title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, title'
      });
    }

    // Check if team exists
    const team = await db.query('SELECT id FROM teams WHERE id = ?', [id]);
    if (team.length === 0) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    const result = await db.query(
      'INSERT INTO team_members (team_id, user_id, title, role, joined_at) VALUES (?, ?, ?, ?, NOW())',
      [id, user_id, title, role || 'member']
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        team_id: id,
        user_id,
        title,
        role: role || 'member',
        joined_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/teams/:id/agents
 * Assign agents to a team member
 * Body: { team_member_id, agent_ids: [], proficiency_levels: [] }
 */
router.post('/:id/agents', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { team_member_id, agent_ids, proficiency_levels } = req.body;

    if (!team_member_id || !agent_ids || agent_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: team_member_id, agent_ids[]'
      });
    }

    // Verify team member belongs to this team
    const member = await db.query(
      'SELECT id FROM team_members WHERE id = ? AND team_id = ?',
      [team_member_id, id]
    );

    if (member.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Team member not found in this team'
      });
    }

    // Insert agent assignments
    const assignments = [];
    for (let i = 0; i < agent_ids.length; i++) {
      const result = await db.query(
        'INSERT INTO team_agent_assignments (team_member_id, agent_id, proficiency_level, assigned_at) VALUES (?, ?, ?, NOW())',
        [team_member_id, agent_ids[i], proficiency_levels?.[i] || 80]
      );
      assignments.push({
        id: result.insertId,
        agent_id: agent_ids[i],
        proficiency_level: proficiency_levels?.[i] || 80
      });
    }

    res.status(201).json({
      success: true,
      data: {
        team_member_id,
        assignments,
        count: assignments.length
      }
    });
  } catch (error) {
    console.error('Error assigning agents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PUT ENDPOINTS
// ============================================

/**
 * PUT /api/teams/:id
 * Update team information
 * Body: { name, sector, lead_id, description, status }
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sector, lead_id, description, status } = req.body;

    // Check if team exists
    const team = await db.query('SELECT * FROM teams WHERE id = ?', [id]);
    if (team.length === 0) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (sector !== undefined) {
      updates.push('sector = ?');
      params.push(sector);
    }
    if (lead_id !== undefined) {
      updates.push('lead_id = ?');
      params.push(lead_id);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await db.query(
      `UPDATE teams SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({
      success: true,
      data: {
        id,
        ...Object.fromEntries(
          Object.entries({ name, sector, lead_id, description, status })
            .filter(([_, v]) => v !== undefined)
        ),
        updated_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/teams/:id/members/:memberId
 * Update team member information
 * Body: { title, role }
 */
router.put('/:id/members/:memberId', authMiddleware, async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const { title, role } = req.body;

    const member = await db.query(
      'SELECT id FROM team_members WHERE id = ? AND team_id = ?',
      [memberId, id]
    );

    if (member.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Team member not found'
      });
    }

    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      params.push(role);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    params.push(memberId);

    await db.query(
      `UPDATE team_members SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({
      success: true,
      data: {
        id: memberId,
        title,
        role,
        updated_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DELETE ENDPOINTS
// ============================================

/**
 * DELETE /api/teams/:id
 * Delete a team (soft delete - sets status to inactive)
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const team = await db.query('SELECT id FROM teams WHERE id = ?', [id]);
    if (team.length === 0) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    // Soft delete
    await db.query(
      'UPDATE teams SET status = ?, updated_at = NOW() WHERE id = ?',
      ['inactive', id]
    );

    res.json({
      success: true,
      message: 'Team deleted successfully',
      id
    });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/teams/:id/members/:memberId
 * Remove a member from a team
 */
router.delete('/:id/members/:memberId', authMiddleware, async (req, res) => {
  try {
    const { id, memberId } = req.params;

    const member = await db.query(
      'SELECT id FROM team_members WHERE id = ? AND team_id = ?',
      [memberId, id]
    );

    if (member.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Team member not found'
      });
    }

    // Delete agent assignments first
    await db.query(
      'DELETE FROM team_agent_assignments WHERE team_member_id = ?',
      [memberId]
    );

    // Delete team member
    await db.query(
      'DELETE FROM team_members WHERE id = ?',
      [memberId]
    );

    res.json({
      success: true,
      message: 'Team member removed successfully',
      id: memberId
    });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/teams/:id/agents/:assignmentId
 * Unassign an agent from a team member
 */
router.delete('/:id/agents/:assignmentId', authMiddleware, async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await db.query(
      'SELECT id FROM team_agent_assignments WHERE id = ?',
      [assignmentId]
    );

    if (assignment.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent assignment not found'
      });
    }

    await db.query(
      'DELETE FROM team_agent_assignments WHERE id = ?',
      [assignmentId]
    );

    res.json({
      success: true,
      message: 'Agent unassigned successfully',
      id: assignmentId
    });
  } catch (error) {
    console.error('Error unassigning agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
