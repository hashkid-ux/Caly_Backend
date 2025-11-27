// Backend/routes/livecalls.js - Live calls API endpoints
const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));

/**
 * GET /api/calls/active - Get all active calls in real-time
 */
router.get('/active', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        c.id, c.call_sid, c.phone_from, c.phone_to, c.start_ts,
        cli.name as client_name,
        c.transcript_partial, c.current_intent, c.agent_type, c.agent_state,
        EXTRACT(EPOCH FROM (NOW() - c.start_ts)) as duration_seconds
      FROM calls c
      LEFT JOIN clients cli ON c.client_id = cli.id
      WHERE c.end_ts IS NULL
      AND c.start_ts > NOW() - INTERVAL '1 hour'
      ORDER BY c.start_ts DESC`
    );

    res.json({
      calls: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching active calls', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch active calls' });
  }
});

/**
 * GET /api/calls/:id/playback - Get call with playback data
 */
router.get('/:id/playback', async (req, res) => {
  try {
    const { id } = req.params;

    const callResult = await db.calls.getById(id);
    if (!callResult) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Parse transcript timeline if available
    let transcriptTimeline = [];
    if (callResult.transcript_full) {
      // Parse stored transcripts into timeline format
      const lines = callResult.transcript_full.split('\n');
      let timestamp = 0;
      
      transcriptTimeline = lines
        .filter(line => line.trim())
        .map(line => {
          const isUser = line.startsWith('user:');
          const text = line.replace(/^(user|assistant):\s*/, '');
          const item = {
            timestamp,
            role: isUser ? 'user' : 'assistant',
            text
          };
          timestamp += 3; // Assume 3 seconds per line for now
          return item;
        });
    }

    res.json({
      id: callResult.id,
      phone_from: callResult.phone_from,
      phone_to: callResult.phone_to,
      start_ts: callResult.start_ts,
      end_ts: callResult.end_ts,
      duration: callResult.duration,
      recording_url: callResult.recording_url,
      transcript_timeline: transcriptTimeline,
      transcript_full: callResult.transcript_full,
      resolved: callResult.resolved,
      automation_rate: callResult.automation_rate || 0,
      client_name: callResult.client_name
    });
  } catch (error) {
    logger.error('Error fetching playback data', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch playback data' });
  }
});

module.exports = router;
