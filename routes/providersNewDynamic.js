/**
 * Backend: Provider Management Routes
 * Dynamic provider selection and configuration
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/authMiddleware');
const logger = require('../../utils/logger');
const resolve = require('../../utils/moduleResolver');
const telephonyRouter = require('../../services/telephonyRouter');
const apiResponse = require('../../utils/apiResponse');

/**
 * GET /api/providers/supported
 * Get list of all supported providers
 */
router.get('/supported', authMiddleware, async (req, res) => {
  try {
    const providers = await telephonyRouter.getSupportedProviders();
    res.json(apiResponse.success(providers, 'Supported providers list'));
  } catch (error) {
    logger.error('Error fetching supported providers', { error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch providers', 500));
  }
});

/**
 * GET /api/providers/:provider/schema
 * Get configuration schema for specific provider
 */
router.get('/:provider/schema', authMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    const schema = await telephonyRouter.getProviderSchema(provider);

    if (!schema) {
      return res.status(404).json(apiResponse.error('Provider not found', 404));
    }

    res.json(apiResponse.success(schema, `Configuration schema for ${provider}`));
  } catch (error) {
    logger.error('Error fetching provider schema', { provider: req.params.provider, error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch schema', 500));
  }
});

/**
 * GET /api/providers/current
 * Get current active provider for client
 */
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const config = await telephonyRouter.getClientProvider(clientId);

    if (!config) {
      return res.json(apiResponse.success(null, 'No provider configured'));
    }

    res.json(apiResponse.success(
      {
        provider: config.provider_name,
        backup_provider: config.backup_provider,
        is_active: config.is_active,
        tested_at: config.tested_at
      },
      'Current provider configuration'
    ));
  } catch (error) {
    logger.error('Error fetching current provider', { clientId: req.user.client_id, error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch current provider', 500));
  }
});

/**
 * GET /api/providers/status
 * Get provider health status
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const status = await telephonyRouter.getProviderStatus(clientId);

    res.json(apiResponse.success(status, 'Provider health status'));
  } catch (error) {
    logger.error('Error fetching provider status', { clientId: req.user.client_id, error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch status', 500));
  }
});

/**
 * POST /api/providers/test
 * Test provider credentials
 */
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const { provider, credentials } = req.body;

    if (!provider || !credentials) {
      return res.status(400).json(apiResponse.error('Provider and credentials required', 400));
    }

    const result = await telephonyRouter.testProviderConnection(provider, credentials);

    if (result.success) {
      res.json(apiResponse.success(result, 'Connection verified'));
    } else {
      res.status(400).json(apiResponse.error(result.error, 400));
    }
  } catch (error) {
    logger.error('Error testing provider', { error: error.message });
    res.status(500).json(apiResponse.error('Failed to test provider', 500));
  }
});

/**
 * POST /api/providers/select/:provider
 * Select and activate provider for client
 */
router.post('/select/:provider', authMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    const { credentials, backup_provider } = req.body;
    const clientId = req.user.client_id;

    if (!credentials) {
      return res.status(400).json(apiResponse.error('Credentials required', 400));
    }

    const result = await telephonyRouter.setActiveProvider(
      clientId,
      provider,
      credentials,
      backup_provider
    );

    logger.info('Provider selected for client', { clientId, provider, backup: backup_provider });

    res.json(apiResponse.success(
      {
        provider: result.provider_name,
        backup: result.backup_provider,
        status: 'active'
      },
      `${provider} activated successfully`
    ));
  } catch (error) {
    logger.error('Error selecting provider', { 
      provider: req.params.provider,
      clientId: req.user.client_id,
      error: error.message 
    });
    res.status(500).json(apiResponse.error(error.message || 'Failed to select provider', 500));
  }
});

/**
 * PUT /api/providers/failover
 * Manually trigger failover to backup provider
 */
router.put('/failover', authMiddleware, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const { reason } = req.body;

    const result = await telephonyRouter.failoverToBackupProvider(
      clientId,
      reason || 'Manual failover'
    );

    logger.info('Provider failover triggered', { clientId });

    res.json(apiResponse.success(
      {
        provider: result.provider_name,
        backup: result.backup_provider
      },
      'Failover completed'
    ));
  } catch (error) {
    logger.error('Error triggering failover', { clientId: req.user.client_id, error: error.message });
    res.status(500).json(apiResponse.error(error.message || 'Failover failed', 500));
  }
});

/**
 * DELETE /api/providers/:provider/credentials
 * Remove provider credentials
 */
router.delete('/:provider/credentials', authMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    const clientId = req.user.client_id;

    // Check if it's the active provider
    const config = await telephonyRouter.getClientProvider(clientId);
    if (config?.provider_name === provider) {
      return res.status(400).json(apiResponse.error('Cannot delete active provider', 400));
    }

    // Delete from database
    const query = `
      DELETE FROM telephony_config
      WHERE client_id = $1 AND provider_name = $2
      RETURNING provider_name
    `;

    const result = await require('../../db/postgres').query(query, [clientId, provider]);

    if (result.rows.length === 0) {
      return res.status(404).json(apiResponse.error('Provider not found', 404));
    }

    logger.info('Provider credentials deleted', { clientId, provider });

    res.json(apiResponse.success(null, `${provider} credentials removed`));
  } catch (error) {
    logger.error('Error deleting provider credentials', { error: error.message });
    res.status(500).json(apiResponse.error('Failed to delete credentials', 500));
  }
});

/**
 * GET /api/providers/history
 * Get call history for provider
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const { provider, limit = 50 } = req.query;

    if (!provider) {
      return res.status(400).json(apiResponse.error('Provider parameter required', 400));
    }

    const history = await telephonyRouter.getCallHistory(clientId, provider, parseInt(limit));

    res.json(apiResponse.success(history, `Call history for ${provider}`));
  } catch (error) {
    logger.error('Error fetching call history', { error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch history', 500));
  }
});

/**
 * POST /api/providers/webhook/:provider
 * Handle incoming webhooks from providers
 */
router.post('/webhook/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const callData = req.body;

    logger.info(`Webhook received from ${provider}`, { data: callData });

    // Get provider handler
    const config = await telephonyRouter.getClientProvider(callData.client_id || callData.ClientId);
    if (!config || config.provider_name !== provider) {
      return res.status(400).json(apiResponse.error('Provider mismatch', 400));
    }

    // Handle webhook based on provider
    switch (provider) {
      case 'exotel':
        // Process Exotel webhook
        logger.info('Processing Exotel webhook', { callData });
        break;
      case 'twilio':
        // Process Twilio webhook
        logger.info('Processing Twilio webhook', { callData });
        break;
      case 'voicebase':
        // Process VoiceBase webhook
        logger.info('Processing VoiceBase webhook', { callData });
        break;
      case 'custom':
        // Process custom provider webhook
        logger.info('Processing custom provider webhook', { callData });
        break;
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error processing webhook', { error: error.message });
    res.status(500).json(apiResponse.error('Webhook processing failed', 500));
  }
});

module.exports = router;
