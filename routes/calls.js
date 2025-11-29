// routes/calls.js - Calls API endpoints
const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));
const Pagination = require(resolve('utils/pagination'));
const { authMiddleware } = require(resolve('auth/authMiddleware'));

// GET /api/calls - List all calls (MULTI-TENANT: filtered by user's client_id)
router.get('/', authMiddleware, async (req, res) => {
  try {
    // CRITICAL: User can only see their own company's calls
    const userClientId = req.user.client_id;
    
    // Extract query parameters
    const {
      limit = 50,
      offset = 0,
      sector,
      agent,
      status,
      days,
      search,
      resolved,
      phone_from
    } = req.query;

    // Validate pagination inputs
    const pageLimit = Math.min(parseInt(limit) || 50, 500);
    const pageOffset = Math.max(parseInt(offset) || 0, 0);

    // Start building query parameters with client_id
    let queryParams = [userClientId];
    let paramCount = 2;
    let whereConditions = ['client_id = $1'];

    // Add sector filter
    if (sector && sector.trim()) {
      whereConditions.push(`sector = $${paramCount}`);
      queryParams.push(sector.trim());
      paramCount++;
    }

    // Add agent filter
    if (agent && agent.trim()) {
      whereConditions.push(`agent_type = $${paramCount}`);
      queryParams.push(agent.trim());
      paramCount++;
    }

    // Add status filter
    if (status && status.trim()) {
      if (status === 'completed') {
        whereConditions.push(`resolved = $${paramCount}`);
        queryParams.push(true);
      } else if (status === 'escalated') {
        whereConditions.push(`escalated = $${paramCount}`);
        queryParams.push(true);
      } else if (status === 'failed') {
        whereConditions.push(`failed = $${paramCount}`);
        queryParams.push(true);
      }
      paramCount++;
    }

    // Add date range filter (not parameterized - it's a literal)
    if (days) {
      const daysInt = Math.min(Math.max(parseInt(days) || 7, 1), 365);
      whereConditions.push(`start_ts >= NOW() - INTERVAL '${daysInt} days'`);
    }

    // Add search filter
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push(
        `(customer_name ILIKE $${paramCount} OR customer_phone ILIKE $${paramCount} OR phone_from ILIKE $${paramCount})`
      );
      queryParams.push(searchTerm);
      paramCount++;
    }

    // Legacy resolved filter
    if (resolved !== undefined) {
      whereConditions.push(`resolved = $${paramCount}`);
      queryParams.push(resolved === 'true');
      paramCount++;
    }

    // Legacy phone_from filter
    if (phone_from) {
      whereConditions.push(`phone_from = $${paramCount}`);
      queryParams.push(phone_from);
      paramCount++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count - also filtered by client_id
    const countQuery = `SELECT COUNT(*) as total FROM calls WHERE ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams.slice(0, paramCount - 1));
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Fetch calls with pagination
    const dataQuery = `
      SELECT 
        id,
        client_id,
        start_ts,
        end_ts,
        duration_seconds,
        customer_name,
        customer_phone,
        phone_from,
        agent_type,
        sector,
        call_status,
        recording_url,
        transcript,
        resolved,
        satisfaction_score,
        created_at,
        updated_at
      FROM calls 
      WHERE ${whereClause}
      ORDER BY start_ts DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    // Add limit and offset
    const finalParams = [...queryParams.slice(0, paramCount - 1), pageLimit, pageOffset];
    
    const result = await db.query(dataQuery, finalParams);

    // Return success response
    res.json({
      success: true,
      data: result.rows || [],
      total: total,
      page: Math.floor(pageOffset / pageLimit) + 1,
      pages: Math.ceil(total / pageLimit),
      limit: pageLimit,
      offset: pageOffset
    });

  } catch (error) {
    logger.error('Error fetching calls', { error: error.message, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch calls',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
});

// GET /api/calls/:id - Get single call with actions (MULTI-TENANT: verify ownership)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userClientId = req.user.client_id;

    // Verify call belongs to user's company
    const call = await db.query(
      'SELECT * FROM calls WHERE id = $1 AND client_id = $2',
      [id, userClientId]
    );

    if (!call.rows || call.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Get associated actions
    const actions = await db.query(
      'SELECT * FROM actions WHERE call_id = $1 AND client_id = $2 ORDER BY timestamp ASC',
      [id, userClientId]
    );

    // Get extracted entities
    const entities = await db.query(
      `SELECT e.* FROM entities e
       JOIN calls c ON e.call_id = c.id
       WHERE e.call_id = $1 AND c.client_id = $2`,
      [id, userClientId]
    );

    res.json({
      call,
      actions,
      entities
    });

  } catch (error) {
    logger.error('Error fetching call', { 
      callId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch call' });
  }
});

// PATCH /api/calls/:id - Update call
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate allowed fields
    const allowedFields = ['resolved', 'transcript_full', 'recording_url'];
    const filteredUpdates = {};

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const updatedCall = await db.calls.update(id, filteredUpdates);

    if (!updatedCall) {
      return res.status(404).json({ error: 'Call not found' });
    }

    logger.info('Call updated', { callId: id, updates: filteredUpdates });

    res.json({ call: updatedCall });

  } catch (error) {
    logger.error('Error updating call', { 
      callId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to update call' });
  }
});

// GET /api/calls/:id/transcript - Get call transcript
router.get('/:id/transcript', async (req, res) => {
  try {
    const { id } = req.params;

    const call = await db.calls.getById(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json({
      call_id: call.id,
      transcript: call.transcript_full,
      start_ts: call.start_ts,
      end_ts: call.end_ts
    });

  } catch (error) {
    logger.error('Error fetching transcript', { 
      callId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// GET /api/calls/:id/recording - Get recording URL
router.get('/:id/recording', async (req, res) => {
  try {
    const { id } = req.params;

    const call = await db.calls.getById(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    if (!call.recording_url) {
      return res.status(404).json({ error: 'Recording not available' });
    }

    res.json({
      call_id: call.id,
      recording_url: call.recording_url
    });

  } catch (error) {
    logger.error('Error fetching recording', { 
      callId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch recording' });
  }
});

module.exports = router;