// routes/calls.js - Calls API endpoints
const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));
const Pagination = require(resolve('utils/pagination'));

// GET /api/calls - List all calls (MULTI-TENANT: filtered by user's client_id)
router.get('/', async (req, res) => {
  try {
    // CRITICAL: User can only see their own company's calls
    const userClientId = req.user.client_id;
    
    // Use pagination utility
    const pagination = Pagination.fromQuery(req.query);

    const { 
      resolved,
      phone_from
    } = req.query;

    let query = 'SELECT * FROM calls WHERE client_id = $1';
    const params = [userClientId];
    let paramIndex = 2;

    if (resolved !== undefined) {
      query += ` AND resolved = $${paramIndex}`;
      params.push(resolved === 'true');
      paramIndex++;
    }

    if (phone_from) {
      query += ` AND phone_from = $${paramIndex}`;
      params.push(phone_from);
      paramIndex++;
    }

    query += ` ORDER BY start_ts DESC${pagination.applySql()}`;
    params.push(pagination.limit, pagination.offset);

    const result = await db.query(query, params);

    // Get total count - also filtered by client_id
    let countQuery = 'SELECT COUNT(*) FROM calls WHERE client_id = $1';
    const countParams = [userClientId];
    let countParamIndex = 2;

    if (resolved !== undefined) {
      countQuery += ` AND resolved = $${countParamIndex}`;
      countParams.push(resolved === 'true');
      countParamIndex++;
    }

    if (phone_from) {
      countQuery += ` AND phone_from = $${countParamIndex}`;
      countParams.push(phone_from);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      calls: result.rows,
      ...pagination.getMetadata(total),
    });

  } catch (error) {
    logger.error('Error fetching calls', { error: error.message, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch calls' });
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