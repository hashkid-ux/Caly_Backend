// routes/actions.js - Actions API endpoints
const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));

// GET /api/actions - List all actions
router.get('/', async (req, res) => {
  try {
    // CRITICAL: User can only see their own company's actions
    const userClientId = req.user.client_id;
    
    const { 
      call_id,
      action_type,
      status,
      limit = 100,
      offset = 0
    } = req.query;

    let query = 'SELECT a.*, c.phone_from, c.client_id FROM actions a JOIN calls c ON a.call_id = c.id WHERE c.client_id = $1';
    const params = [userClientId];
    let paramIndex = 2;

    if (call_id) {
      query += ` AND a.call_id = $${paramIndex}`;
      params.push(call_id);
      paramIndex++;
    }

    if (action_type) {
      query += ` AND a.action_type = $${paramIndex}`;
      params.push(action_type);
      paramIndex++;
    }

    if (status) {
      query += ` AND a.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    res.json({
      actions: result.rows,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    logger.error('Error fetching actions', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch actions' });
  }
});

// GET /api/actions/:id - Get single action
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userClientId = req.user.client_id;

    // CRITICAL: Verify action belongs to user's company
    const result = await db.query(
      `SELECT a.* FROM actions a
       JOIN calls c ON a.call_id = c.id
       WHERE a.id = $1 AND c.client_id = $2`,
      [id, userClientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found or access denied' });
    }

    res.json({ action: result.rows[0] });

  } catch (error) {
    logger.error('Error fetching action', { 
      actionId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch action' });
  }
});

// GET /api/actions/stats - Get action statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const userClientId = req.user.client_id;  // Use authenticated user's company
    const { start_date, end_date } = req.query;

    let query = `
      SELECT 
        action_type,
        status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration_seconds
      FROM actions a
      JOIN calls c ON a.call_id = c.id
      WHERE c.client_id = $1
    `;
    const params = [userClientId];
    let paramIndex = 2;

    if (start_date) {
      query += ` AND a.created_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND a.created_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    query += ' GROUP BY action_type, status ORDER BY count DESC';

    const result = await db.query(query, params);

    res.json({
      statistics: result.rows
    });

  } catch (error) {
    logger.error('Error fetching action stats', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;