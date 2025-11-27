// routes/exotel.js - Exotel webhook handlers
const { v4: uuidv4 } = require('uuid');
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));
const { queueRecordingUpload } = require(resolve('services/recordingService'));

// Get webhook base URL - strict production validation
const getWebhookBaseUrl = () => {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    // Railway environment - use auto-generated public domain
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (process.env.EXOTEL_WEBHOOK_BASE_URL && process.env.EXOTEL_WEBHOOK_BASE_URL !== 'https://yourdomain.com') {
    // Custom domain set in env variables
    return process.env.EXOTEL_WEBHOOK_BASE_URL;
  }
  // Production strict - require explicit configuration
  if (process.env.NODE_ENV === 'production') {
    throw new Error('❌ CRITICAL: EXOTEL_WEBHOOK_BASE_URL or RAILWAY_PUBLIC_DOMAIN must be set in production');
  }
  // Development fallback
  logger.warn('⚠️  Using localhost fallback for Exotel webhooks (development only)');
  return 'http://localhost:3000';
};

logger.info('Webhook base URL configured', {
  baseUrl: getWebhookBaseUrl(),
  isRailway: !!process.env.RAILWAY_PUBLIC_DOMAIN,
  nodeEnv: process.env.NODE_ENV
});

// Handle call start webhook from Exotel
const handleCallStart = async (req, res) => {
  try {
    const {
      CallSid,
      From,
      To,
      CallStatus,
      Direction
    } = req.body;

    logger.info('Exotel call started', {
      callSid: CallSid,
      from: From,
      to: To,
      status: CallStatus,
      direction: Direction
    });

    // Get client by Exotel number
    const clients = await db.clients.getActive();
    const client = clients.find(c => c.exotel_number === To);

    if (!client) {
      logger.error('No client found for Exotel number', { to: To });
      return res.status(404).json({ error: 'Client not found' });
    }

    // Create call record in database
    const call = await db.calls.create({
      client_id: client.id,
      call_sid: CallSid,
      phone_from: From,
      phone_to: To
    });

    // Log audit event
    await db.auditLog({
      call_id: call.id,
      client_id: client.id,
      event_type: 'call_started',
      payload: { CallSid, From, To, CallStatus },
      ip_address: req.ip
    });

    // Return Exotel response with streaming instructions
    // This tells Exotel to stream audio to our WebSocket
    const response = {
      Response: {
        Say: {
          _text: 'Namaste, main Caly hoon. Aapki kaise madad kar sakti hoon?',
          voice: 'woman',
          language: 'hi-IN'
        },
        Stream: {
          _attributes: {
            url: `${getWebhookBaseUrl()}/audio?callId=${call.id}`,
            track: 'both_tracks' // Record both inbound and outbound
          }
        }
      }
    };

    res.set('Content-Type', 'application/json');
    res.status(200).json(response);

  } catch (error) {
    logger.error('Error handling call start', { 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Handle call end webhook from Exotel
const handleCallEnd = async (req, res) => {
  try {
    const {
      CallSid,
      CallDuration,
      CallStatus,
      RecordingUrl
    } = req.body;

    logger.info('Exotel call ended', {
      callSid: CallSid,
      duration: CallDuration,
      status: CallStatus,
      recordingUrl: RecordingUrl
    });

    // Find call by CallSid
    const result = await db.query(
      'SELECT * FROM calls WHERE call_sid = $1',
      [CallSid]
    );

    if (result.rows.length === 0) {
      logger.error('Call not found', { callSid: CallSid });
      return res.status(404).json({ error: 'Call not found' });
    }

    const call = result.rows[0];

    // Update call record with end time and recording URL
    await db.calls.update(call.id, {
      end_ts: new Date(),
      recording_url: RecordingUrl
    });

    // Log audit event
    await db.auditLog({
      call_id: call.id,
      client_id: call.client_id,
      event_type: 'call_ended',
      payload: { CallSid, CallDuration, CallStatus, RecordingUrl },
      ip_address: req.ip
    });

    // 🔒 PHASE 1 FIX 1.3: Queue recording for async download/upload to Wasabi
    // This doesn't block the webhook response - recording is processed in background
    if (RecordingUrl) {
      try {
        await queueRecordingUpload({
          callId: call.id,
          callSid: CallSid,
          clientId: call.client_id,
          recordingUrl: RecordingUrl,
          recordingDuration: req.body.RecordingDuration,
          exotelNumber: To,
          fromNumber: From
        });
        logger.info('Recording queued for upload', {
          callId: call.id,
          recordingUrl: RecordingUrl
        });
      } catch (queueError) {
        // Queue error shouldn't block webhook response - log and continue
        logger.error('Failed to queue recording upload', {
          callId: call.id,
          error: queueError.message
        });
      }
    }

    res.status(200).json({ status: 'success' });

  } catch (error) {
    logger.error('Error handling call end', { 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Handle recording webhook from Exotel (optional)
const handleRecording = async (req, res) => {
  try {
    const {
      CallSid,
      RecordingUrl,
      RecordingDuration
    } = req.body;

    logger.info('Exotel recording received', {
      callSid: CallSid,
      recordingUrl: RecordingUrl,
      duration: RecordingDuration
    });

    // Find call by CallSid
    const result = await db.query(
      'SELECT * FROM calls WHERE call_sid = $1',
      [CallSid]
    );

    if (result.rows.length === 0) {
      logger.error('Call not found for recording', { callSid: CallSid });
      return res.status(404).json({ error: 'Call not found' });
    }

    const call = result.rows[0];

    // Update recording URL
    await db.calls.update(call.id, {
      recording_url: RecordingUrl
    });

    // Log audit event
    await db.auditLog({
      call_id: call.id,
      client_id: call.client_id,
      event_type: 'recording_received',
      payload: { CallSid, RecordingUrl, RecordingDuration },
      ip_address: req.ip
    });

    // 🔒 PHASE 1 FIX 1.3: Queue recording for async download/upload to Wasabi
    // This is a separate webhook, so we queue it independently
    try {
      await queueRecordingUpload({
        callId: call.id,
        callSid: CallSid,
        clientId: call.client_id,
        recordingUrl: RecordingUrl,
        recordingDuration: RecordingDuration,
        source: 'separate_webhook'
      });
      logger.info('Recording queued from separate webhook', {
        callId: call.id,
        recordingUrl: RecordingUrl
      });
    } catch (queueError) {
      logger.error('Failed to queue recording from webhook', {
        callId: call.id,
        error: queueError.message
      });
    }

    res.status(200).json({ status: 'success' });

  } catch (error) {
    logger.error('Error handling recording', { 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  handleCallStart,
  handleCallEnd,
  handleRecording
};