const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../utils/logger');
const { withTimeout } = require('../utils/timeoutUtil');
const resolve = require('../utils/moduleResolver');

/**
 * Admin Settings Routes - Phase 11
 * System configuration and preferences
 */

/**
 * GET /api/settings/system
 * Get system-wide settings
 */
router.get('/system', async (req, res) => {
  try {
    const { client_id } = req.user;

    const result = await withTimeout(async () => {
      return await db.query(
        `SELECT 
          company_name, timezone, language, currency,
          max_concurrent_calls, call_recording_enabled,
          ai_enabled, sentiment_analysis_enabled,
          sms_enabled, email_notifications_enabled,
          created_at, updated_at
         FROM clients
         WHERE id = $1`,
        [client_id]
      );
    }, 30000, 'fetch system settings');

    res.json({
      success: true,
      data: result.rows[0] || {}
    });
  } catch (error) {
    logger.error('Settings fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /api/settings/system
 * Update system settings
 */
router.put('/system', async (req, res) => {
  try {
    const { client_id } = req.user;
    const {
      company_name,
      timezone,
      language,
      currency,
      max_concurrent_calls,
      call_recording_enabled,
      ai_enabled,
      sentiment_analysis_enabled,
      sms_enabled,
      email_notifications_enabled
    } = req.body;

    const result = await withTimeout(async () => {
      return await db.query(
        `UPDATE clients
         SET company_name = COALESCE($1, company_name),
             timezone = COALESCE($2, timezone),
             language = COALESCE($3, language),
             currency = COALESCE($4, currency),
             max_concurrent_calls = COALESCE($5, max_concurrent_calls),
             call_recording_enabled = COALESCE($6, call_recording_enabled),
             ai_enabled = COALESCE($7, ai_enabled),
             sentiment_analysis_enabled = COALESCE($8, sentiment_analysis_enabled),
             sms_enabled = COALESCE($9, sms_enabled),
             email_notifications_enabled = COALESCE($10, email_notifications_enabled),
             updated_at = NOW()
         WHERE id = $11
         RETURNING *`,
        [
          company_name, timezone, language, currency,
          max_concurrent_calls, call_recording_enabled,
          ai_enabled, sentiment_analysis_enabled,
          sms_enabled, email_notifications_enabled,
          client_id
        ]
      );
    }, 30000, 'update system settings');

    logger.info('System settings updated', { client_id });

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Settings update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

/**
 * GET /api/settings/integrations
 * Get integration settings (API keys, webhooks, etc.)
 */
router.get('/integrations', async (req, res) => {
  try {
    const { client_id } = req.user;

    const result = await withTimeout(async () => {
      return await db.query(
        `SELECT 
          integration_type, is_enabled, api_key_masked,
          webhook_url, created_at, updated_at
         FROM integrations
         WHERE client_id = $1
         ORDER BY integration_type`,
        [client_id]
      );
    }, 30000, 'fetch integrations');

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Integrations fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch integrations' });
  }
});

/**
 * POST /api/settings/integrations
 * Add integration
 */
router.post('/integrations', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { integration_type, api_key, webhook_url, is_enabled } = req.body;

    if (!integration_type || !api_key) {
      return res.status(400).json({
        success: false,
        error: 'integration_type and api_key required'
      });
    }

    const result = await withTimeout(async () => {
      return await db.query(
        `INSERT INTO integrations (client_id, integration_type, api_key, webhook_url, is_enabled)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, integration_type, is_enabled`,
        [client_id, integration_type, api_key, webhook_url, is_enabled !== false]
      );
    }, 30000, 'add integration');

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Integration add error:', error);
    res.status(500).json({ success: false, error: 'Failed to add integration' });
  }
});

/**
 * PUT /api/settings/integrations/:integrationId
 * Update integration
 */
router.put('/integrations/:integrationId', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { integrationId } = req.params;
    const { api_key, webhook_url, is_enabled } = req.body;

    const result = await withTimeout(async () => {
      return await db.query(
        `UPDATE integrations
         SET api_key = COALESCE($1, api_key),
             webhook_url = COALESCE($2, webhook_url),
             is_enabled = COALESCE($3, is_enabled),
             updated_at = NOW()
         WHERE id = $4 AND client_id = $5
         RETURNING id, integration_type, is_enabled`,
        [api_key, webhook_url, is_enabled, integrationId, client_id]
      );
    }, 30000, 'update integration');

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Integration update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update integration' });
  }
});

/**
 * DELETE /api/settings/integrations/:integrationId
 * Remove integration
 */
router.delete('/integrations/:integrationId', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { integrationId } = req.params;

    await withTimeout(async () => {
      return await db.query(
        `DELETE FROM integrations WHERE id = $1 AND client_id = $2`,
        [integrationId, client_id]
      );
    }, 30000, 'delete integration');

    res.json({
      success: true,
      message: 'Integration removed'
    });
  } catch (error) {
    logger.error('Integration delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove integration' });
  }
});

/**
 * GET /api/settings/notifications
 * Get notification preferences
 */
router.get('/notifications', async (req, res) => {
  try {
    const { client_id } = req.user;

    const result = await withTimeout(async () => {
      return await db.query(
        `SELECT 
          id, event_type, channel, recipient, enabled
         FROM notification_settings
         WHERE client_id = $1
         ORDER BY event_type`,
        [client_id]
      );
    }, 30000, 'fetch notifications');

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Notifications fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

/**
 * PUT /api/settings/notifications/:eventType
 * Update notification preferences
 */
router.put('/notifications/:eventType', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { eventType } = req.params;
    const { channel, recipient, enabled } = req.body;

    const result = await withTimeout(async () => {
      return await db.query(
        `UPDATE notification_settings
         SET channel = COALESCE($1, channel),
             recipient = COALESCE($2, recipient),
             enabled = COALESCE($3, enabled),
             updated_at = NOW()
         WHERE client_id = $4 AND event_type = $5
         RETURNING id, event_type, channel, recipient, enabled`,
        [channel, recipient, enabled, client_id, eventType]
      );
    }, 30000, 'update notifications');

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Notifications update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update notifications' });
  }
});

module.exports = router;
