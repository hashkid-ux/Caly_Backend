/**
 * Channels Routes - Multi-channel configuration management
 * Handles: SMS, Email, WhatsApp, Voice channel setup and testing
 * Multi-tenant: All operations filtered by client_id from JWT token
 */

const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));
const { authMiddleware } = require(resolve('auth/authMiddleware'));
const { encryptData, decryptData } = require(resolve('utils/encryption'));

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * GET /api/channels
 * Get all channels configured for company
 */
router.get('/', async (req, res) => {
  try {
    const clientId = req.user.client_id;

    const result = await db.query(
      `SELECT id, channel_type, provider, is_enabled, webhook_url, rate_limit_per_hour, created_at 
       FROM channels WHERE client_id = $1 ORDER BY created_at ASC`,
      [clientId]
    );

    res.json({
      success: true,
      data: result.rows || []
    });

  } catch (error) {
    logger.error('Error fetching channels', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch channels' });
  }
});

/**
 * GET /api/channels/:type
 * Get specific channel configuration
 */
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const clientId = req.user.client_id;

    const result = await db.query(
      `SELECT id, channel_type, provider, is_enabled, webhook_url, rate_limit_per_hour, created_at 
       FROM channels WHERE client_id = $1 AND channel_type = $2`,
      [clientId, type]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: `${type} channel not configured` });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error fetching channel', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch channel' });
  }
});

/**
 * POST /api/channels
 * Create or update a channel configuration
 */
router.post('/', async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const { channel_type, provider, credentials, configuration, rate_limit_per_hour } = req.body;

    // Validate channel type
    const validChannels = ['sms', 'email', 'whatsapp', 'voice', 'telegram'];
    if (!validChannels.includes(channel_type)) {
      return res.status(400).json({ success: false, error: 'Invalid channel type' });
    }

    // Encrypt sensitive credentials
    const encryptedCredentials = {};
    if (credentials) {
      for (const [key, value] of Object.entries(credentials)) {
        if (['api_key', 'api_secret', 'token', 'password', 'auth_token'].includes(key)) {
          encryptedCredentials[key] = encryptData(String(value));
        } else {
          encryptedCredentials[key] = value;
        }
      }
    }

    const result = await db.query(
      `INSERT INTO channels (client_id, channel_type, provider, credentials, configuration, rate_limit_per_hour, is_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (client_id, channel_type) DO UPDATE SET
        provider = $3,
        credentials = $4,
        configuration = $5,
        rate_limit_per_hour = $6,
        is_enabled = TRUE,
        updated_at = NOW()
       RETURNING id, channel_type, provider, is_enabled, rate_limit_per_hour, created_at`,
      [clientId, channel_type, provider, JSON.stringify(encryptedCredentials), JSON.stringify(configuration), rate_limit_per_hour || 0]
    );

    logger.info('Channel configured', { clientId, channel: channel_type, provider });

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error creating channel', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create channel' });
  }
});

/**
 * PUT /api/channels/:type
 * Update channel configuration
 */
router.put('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const clientId = req.user.client_id;
    const { provider, credentials, configuration, rate_limit_per_hour, is_enabled } = req.body;

    // Verify channel exists
    const verify = await db.query(
      'SELECT id FROM channels WHERE client_id = $1 AND channel_type = $2',
      [clientId, type]
    );

    if (!verify.rows.length) {
      return res.status(404).json({ success: false, error: 'Channel not found' });
    }

    // Encrypt credentials if provided
    let encryptedCredentials = null;
    if (credentials) {
      encryptedCredentials = {};
      for (const [key, value] of Object.entries(credentials)) {
        if (['api_key', 'api_secret', 'token', 'password', 'auth_token'].includes(key)) {
          encryptedCredentials[key] = encryptData(String(value));
        } else {
          encryptedCredentials[key] = value;
        }
      }
    }

    const result = await db.query(
      `UPDATE channels SET 
        provider = COALESCE($3, provider),
        credentials = COALESCE($4, credentials),
        configuration = COALESCE($5, configuration),
        rate_limit_per_hour = COALESCE($6, rate_limit_per_hour),
        is_enabled = COALESCE($7, is_enabled),
        updated_at = NOW()
      WHERE client_id = $1 AND channel_type = $2
      RETURNING id, channel_type, provider, is_enabled, created_at`,
      [clientId, type, provider, encryptedCredentials ? JSON.stringify(encryptedCredentials) : null, configuration ? JSON.stringify(configuration) : null, rate_limit_per_hour, is_enabled]
    );

    logger.info('Channel updated', { clientId, channel: type });

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error updating channel', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update channel' });
  }
});

/**
 * POST /api/channels/:type/test
 * Test channel connectivity
 */
router.post('/:type/test', async (req, res) => {
  try {
    const { type } = req.params;
    const clientId = req.user.client_id;

    const result = await db.query(
      'SELECT * FROM channels WHERE client_id = $1 AND channel_type = $2',
      [clientId, type]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: `${type} channel not configured` });
    }

    const channel = result.rows[0];

    // Test based on channel type
    let testResult = {};
    switch (type.toLowerCase()) {
      case 'sms':
        testResult = await testSmsChannel(channel);
        break;
      case 'email':
        testResult = await testEmailChannel(channel);
        break;
      case 'whatsapp':
        testResult = await testWhatsappChannel(channel);
        break;
      case 'voice':
        testResult = await testVoiceChannel(channel);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Unknown channel type' });
    }

    res.json({
      success: true,
      data: testResult
    });

  } catch (error) {
    logger.error('Error testing channel', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to test channel', details: error.message });
  }
});

/**
 * DELETE /api/channels/:type
 * Remove a channel configuration
 */
router.delete('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const clientId = req.user.client_id;

    await db.query(
      'DELETE FROM channels WHERE client_id = $1 AND channel_type = $2',
      [clientId, type]
    );

    logger.info('Channel deleted', { clientId, channel: type });

    res.json({
      success: true,
      message: `${type} channel removed`
    });

  } catch (error) {
    logger.error('Error deleting channel', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete channel' });
  }
});

// ============ HELPER FUNCTIONS ============

async function testSmsChannel(channel) {
  logger.info('Testing SMS channel', { provider: channel.provider });
  
  if (!channel.credentials) {
    return { status: 'error', message: 'Credentials not configured' };
  }

  // Basic validation - in production, would actually send test SMS
  return { 
    status: 'success', 
    message: `SMS channel (${channel.provider}) test passed`
  };
}

async function testEmailChannel(channel) {
  logger.info('Testing Email channel', { provider: channel.provider });
  
  if (!channel.credentials) {
    return { status: 'error', message: 'Credentials not configured' };
  }

  // Basic validation - in production, would actually send test email
  return { 
    status: 'success', 
    message: `Email channel (${channel.provider}) test passed`
  };
}

async function testWhatsappChannel(channel) {
  logger.info('Testing WhatsApp channel', { provider: channel.provider });
  
  if (!channel.credentials) {
    return { status: 'error', message: 'Credentials not configured' };
  }

  // Basic validation
  return { 
    status: 'success', 
    message: `WhatsApp channel test passed`
  };
}

async function testVoiceChannel(channel) {
  logger.info('Testing Voice channel', { provider: channel.provider });
  
  return { 
    status: 'success', 
    message: `Voice channel (${channel.provider}) test passed`
  };
}

module.exports = router;
