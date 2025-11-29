const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth/authMiddleware');
const logger = require('../utils/logger');

/**
 * Teams Management API Routes - SIMPLIFIED VERSION
 * Returns basic team data structure
 * Full teams implementation pending database schema updates
 */

// ============================================
// GET ENDPOINTS
// ============================================

/**
 * GET /api/teams
 * Get all teams for the user's company
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;
    const { status } = req.query;

    // TODO: Replace with real database query when teams table is populated
    // For now, return mock data structure for frontend testing
    const teams = [
      {
        id: '1',
        name: 'Sales Team',
        description: 'Primary sales team',
        status: 'active',
        member_count: 5,
        members: [],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '2',
        name: 'Support Team',
        description: 'Customer support team',
        status: 'active',
        member_count: 3,
        members: [],
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    res.json({
      success: true,
      data: teams.filter(t => !status || t.status === status),
      count: teams.length
    });
  } catch (error) {
    logger.error('Error fetching teams', { error: error.message, userId: req.user?.id });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch teams',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
});

/**
 * GET /api/teams/:id
 * Get team details with members and performance
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userClientId = req.user.client_id;

    // TODO: Replace with real database query
    // For now, return mock team detail structure
    const team = {
      id,
      name: 'Sales Team',
      description: 'Primary sales team',
      status: 'active',
      sector: 'all',
      members: [
        {
          id: 'mem1',
          name: 'Agent Bot 1',
          email: 'bot1@example.com',
          role: 'agent',
          performance_score: 85
        },
        {
          id: 'mem2',
          name: 'Agent Bot 2',
          email: 'bot2@example.com',
          role: 'agent',
          performance_score: 78
        }
      ],
      performance: {
        avg_score: 81.5,
        total_calls: 1250,
        completion_rate: 92
      },
      created_at: new Date(),
      updated_at: new Date()
    };

    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    logger.error('Error fetching team', { error: error.message, teamId: req.params.id, userId: req.user?.id });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch team',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
});

module.exports = router;

