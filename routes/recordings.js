// Backend/routes/recordings.js - Recording Management API
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth/authMiddleware');
const wasabiStorage = require('../services/wasabiStorage');
const db = require('../db/postgres');
const logger = require('../utils/logger');
const Pagination = require('../utils/pagination');
const { sendSuccess, sendError, sendList, sendNotFound } = require('../utils/apiResponse');

/**
 * GET /api/recordings/:callId
 * Get pre-signed URL for a call recording
 */
router.get('/:callId', authMiddleware, async (req, res) => {
  try {
    const { callId } = req.params;
    const clientId = req.user.client_id;

    // Verify call belongs to authenticated client
    const result = await db.query(
      'SELECT * FROM calls WHERE id = $1 AND client_id = $2',
      [callId, clientId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const call = result.rows[0];
    if (!call.recording_url) {
      return res.status(404).json({ error: 'No recording available for this call' });
    }

    // Get pre-signed URL (valid for 1 hour)
    const preSignedUrl = await wasabiStorage.getPreSignedUrl(
      call.recording_url,
      3600
    );

    logger.info('Pre-signed recording URL generated', { callId, clientId });

    res.json({
      callId,
      recordingUrl: preSignedUrl,
      duration: call.duration_seconds,
      uploadedAt: call.end_ts
    });
  } catch (error) {
    logger.error('Error retrieving recording', {
      callId: req.params.callId,
      error: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recordings
 * List recordings for client with pagination
 * Query params: page (default 1), limit (default 50, max 1000), startDate (optional), endDate (optional)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pagination = Pagination.fromQuery(req.query);
    const { startDate, endDate } = req.query;
    const clientId = req.user.client_id;

    // Build query with optional date filters
    let query = `
      SELECT id, phone_from, duration_seconds, recording_url, end_ts, status 
      FROM calls 
      WHERE client_id = $1 AND recording_url IS NOT NULL
    `;
    const params = [clientId];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND DATE(end_ts) >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND DATE(end_ts) <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY end_ts DESC${pagination.applySql()}`;
    params.push(pagination.limit, pagination.offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM calls WHERE client_id = $1 AND recording_url IS NOT NULL`;
    const countParams = [clientId];
    let countParamIndex = 2;

    if (startDate) {
      countQuery += ` AND DATE(end_ts) >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }

    if (endDate) {
      countQuery += ` AND DATE(end_ts) <= $${countParamIndex}`;
      countParams.push(endDate);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const recordings = result.rows.map(call => ({
      callId: call.id,
      phone: call.phone_from,
      duration: call.duration_seconds,
      recordingUrl: call.recording_url,
      uploadedAt: call.end_ts,
      status: call.status
    }));

    logger.info('Recordings listed', { 
      clientId, 
      count: recordings.length,
      page: pagination.page,
      total 
    });

    return sendList(res, recordings, pagination.getMetadata(total), `Retrieved ${recordings.length} recordings`);
  } catch (error) {
    logger.error('Error listing recordings', {
      clientId: req.user.client_id,
      error: error.message
    });
    return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list recordings');
  }
});

/**
 * DELETE /api/recordings/:callId
 * Delete a call recording from Wasabi
 */
router.delete('/:callId', authMiddleware, async (req, res) => {
  try {
    const { callId } = req.params;
    const clientId = req.user.client_id;

    const result = await db.query(
      'SELECT * FROM calls WHERE id = $1 AND client_id = $2',
      [callId, clientId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const call = result.rows[0];
    if (!call.recording_url) {
      return res.status(404).json({ error: 'No recording to delete' });
    }

    // Delete from Wasabi
    await wasabiStorage.deleteCallRecording(call.recording_url);

    // Update database
    await db.query(
      'UPDATE calls SET recording_url = NULL WHERE id = $1',
      [callId]
    );

    logger.info('Recording deleted', { callId, clientId });

    res.json({ success: true, message: 'Recording deleted' });
  } catch (error) {
    logger.error('Error deleting recording', {
      callId: req.params.callId,
      error: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recordings/storage/stats
 * Get storage usage statistics
 */
router.get('/storage/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await wasabiStorage.getStorageStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting storage stats', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
