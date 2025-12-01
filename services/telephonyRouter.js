/**
 * Backend: Multi-Provider Telephony Router
 * Routes calls through customer's preferred provider (Exotel, Twilio, VoiceBase, Custom)
 * 
 * Real multi-provider support - NO HARDCODING!
 */

const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));
const ExotelProvider = require(resolve('providers/exotelProvider'));
const TwilioProvider = require(resolve('providers/twilioProvider'));
const VoiceBaseProvider = require(resolve('providers/voicebaseProvider'));
const CustomProvider = require(resolve('providers/customProvider'));
const { CircuitBreaker } = require(resolve('utils/circuitBreaker'));
const { withTimeout } = require(resolve('utils/timeoutUtil'));

class TelephonyRouter {
  constructor() {
    this.providers = {
      exotel: new ExotelProvider(),
      twilio: new TwilioProvider(),
      voicebase: new VoiceBaseProvider(),
      custom: new CustomProvider()
    };

    // Circuit breakers for each provider
    this.circuitBreakers = {
      exotel: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 }),
      twilio: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 }),
      voicebase: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 }),
      custom: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 })
    };

    // Provider health check interval
    this.healthCheckInterval = 60000; // 1 minute
    this.initializeHealthChecks();
  }

  /**
   * Get client's active provider configuration
   */
  async getClientProvider(clientId) {
    try {
      const query = `
        SELECT 
          provider_name,
          credentials,
          is_active,
          backup_provider,
          backup_credentials,
          failover_threshold,
          failover_window,
          health_check_interval,
          tested_at,
          error_count
        FROM telephony_config
        WHERE client_id = $1 AND is_active = true
        LIMIT 1
      `;

      const result = await db.query(query, [clientId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching client provider', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Get all providers supported by system
   */
  async getSupportedProviders() {
    return [
      {
        name: 'exotel',
        label: 'Exotel',
        description: 'Indian VoIP provider with excellent Hindi support',
        features: ['IVR', 'Call Recording', 'Voicebot', 'Call Analytics'],
        languages: ['English', 'Hindi', 'Hinglish'],
        pricing: 'Pay-per-minute'
      },
      {
        name: 'twilio',
        label: 'Twilio',
        description: 'Global communications platform',
        features: ['IVR', 'Call Recording', 'SMS', 'WhatsApp'],
        languages: ['English', 'Multiple languages'],
        pricing: 'Pay-per-minute'
      },
      {
        name: 'voicebase',
        label: 'VoiceBase',
        description: 'Voice analytics and call recording',
        features: ['Call Recording', 'Speech Recognition', 'Analytics'],
        languages: ['English', 'Hindi'],
        pricing: 'Subscription-based'
      },
      {
        name: 'custom',
        label: 'Custom Provider',
        description: 'Bring your own VoIP provider',
        features: ['Custom', 'Flexible', 'Webhook-based'],
        languages: ['All supported by your provider'],
        pricing: 'Your provider\'s pricing'
      }
    ];
  }

  /**
   * Get provider-specific configuration schema
   */
  async getProviderSchema(providerName) {
    const schemas = {
      exotel: {
        account_sid: {
          label: 'Account SID',
          type: 'text',
          required: true,
          placeholder: 'e.g., abc123def456',
          help: 'Found in Exotel dashboard under Settings'
        },
        auth_token: {
          label: 'Auth Token',
          type: 'password',
          required: true,
          placeholder: 'Your auth token',
          help: 'Keep this secret!'
        },
        app_id: {
          label: 'App ID',
          type: 'text',
          required: true,
          placeholder: 'Your app ID',
          help: 'Create an app in Exotel dashboard'
        },
        webhook_url: {
          label: 'Webhook URL (Auto-populated)',
          type: 'text',
          required: false,
          placeholder: 'https://your-domain.com/api/webhooks/exotel',
          help: 'Configure in Exotel dashboard'
        }
      },
      twilio: {
        account_sid: {
          label: 'Account SID',
          type: 'text',
          required: true,
          placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxx',
          help: 'Found in Twilio console'
        },
        auth_token: {
          label: 'Auth Token',
          type: 'password',
          required: true,
          placeholder: 'Your auth token',
          help: 'Keep this secret!'
        },
        phone_numbers: {
          label: 'Twilio Phone Number(s)',
          type: 'textarea',
          required: true,
          placeholder: '+1234567890\n+0987654321',
          help: 'One per line with country code'
        }
      },
      voicebase: {
        api_key: {
          label: 'API Key',
          type: 'text',
          required: true,
          placeholder: 'Your API key',
          help: 'Found in VoiceBase account settings'
        },
        api_secret: {
          label: 'API Secret',
          type: 'password',
          required: true,
          placeholder: 'Your API secret',
          help: 'Keep this secret!'
        }
      },
      custom: {
        provider_url: {
          label: 'Provider API URL',
          type: 'text',
          required: true,
          placeholder: 'https://api.your-provider.com',
          help: 'Base URL for API calls'
        },
        api_key: {
          label: 'API Key',
          type: 'password',
          required: true,
          placeholder: 'Your API key',
          help: 'For authentication'
        },
        webhook_secret: {
          label: 'Webhook Secret (for signature validation)',
          type: 'password',
          required: false,
          placeholder: 'Optional webhook secret',
          help: 'If your provider signs webhooks'
        }
      }
    };

    return schemas[providerName] || null;
  }

  /**
   * Test provider credentials
   */
  async testProviderConnection(providerName, credentials) {
    try {
      const provider = this.providers[providerName];
      if (!provider) {
        throw new Error(`Unknown provider: ${providerName}`);
      }

      // Use timeout wrapper for testing
      const result = await withTimeout(
        async () => provider.testConnection(credentials),
        10000,
        `Test connection for ${providerName}`
      );

      return {
        success: true,
        provider: providerName,
        message: 'Connection verified successfully',
        details: result
      };
    } catch (error) {
      logger.warn('Provider connection test failed', { providerName, error: error.message });
      return {
        success: false,
        provider: providerName,
        error: error.message,
        message: `Failed to verify ${providerName} credentials`
      };
    }
  }

  /**
   * Set active provider for client
   */
  async setActiveProvider(clientId, providerName, credentials, backupProvider = null) {
    try {
      // Test credentials first
      const test = await this.testProviderConnection(providerName, credentials);
      if (!test.success) {
        throw new Error(test.error);
      }

      // Encrypt credentials
      const encryptedCreds = this.encryptCredentials(credentials);
      let encryptedBackup = null;
      if (backupProvider) {
        const backupCreds = credentials.backup_credentials || {};
        encryptedBackup = this.encryptCredentials(backupCreds);
      }

      // Update or insert
      const query = `
        INSERT INTO telephony_config (
          client_id,
          provider_name,
          credentials,
          is_active,
          backup_provider,
          backup_credentials,
          tested_at,
          health_check_interval
        ) VALUES ($1, $2, $3, true, $4, $5, NOW(), $6)
        ON CONFLICT (client_id) DO UPDATE SET
          provider_name = EXCLUDED.provider_name,
          credentials = EXCLUDED.credentials,
          is_active = true,
          backup_provider = EXCLUDED.backup_provider,
          backup_credentials = EXCLUDED.backup_credentials,
          tested_at = NOW(),
          error_count = 0
        RETURNING *
      `;

      const result = await db.query(query, [
        clientId,
        providerName,
        encryptedCreds,
        backupProvider,
        encryptedBackup,
        this.healthCheckInterval
      ]);

      // Audit log
      await this.logAudit(clientId, 'provider_set', providerName, {
        backup: backupProvider
      });

      logger.info('Provider set for client', { clientId, providerName, backup: backupProvider });
      return result.rows[0];
    } catch (error) {
      logger.error('Error setting active provider', { clientId, providerName, error: error.message });
      throw error;
    }
  }

  /**
   * Route inbound call to correct provider handler
   */
  async handleInboundCall(clientId, callData) {
    try {
      const config = await this.getClientProvider(clientId);
      if (!config) {
        throw new Error(`No provider configured for client: ${clientId}`);
      }

      const provider = this.providers[config.provider_name];
      if (!provider) {
        throw new Error(`Unknown provider: ${config.provider_name}`);
      }

      // Decrypt credentials
      const credentials = this.decryptCredentials(config.credentials);

      // Check circuit breaker
      if (!this.circuitBreakers[config.provider_name].isAllowed()) {
        logger.warn('Provider circuit breaker open, attempting failover', { clientId });
        return await this.failoverToBackupProvider(clientId, 'Circuit breaker open');
      }

      try {
        const result = await withTimeout(
          async () => provider.handleInboundCall(callData, credentials),
          30000,
          `Inbound call handling for ${config.provider_name}`
        );

        this.circuitBreakers[config.provider_name].recordSuccess();
        return result;
      } catch (error) {
        this.circuitBreakers[config.provider_name].recordFailure();

        // Try failover if available
        if (config.backup_provider) {
          logger.info('Primary provider failed, attempting failover', { clientId });
          return await this.failoverToBackupProvider(clientId, error.message);
        }

        throw error;
      }
    } catch (error) {
      logger.error('Error handling inbound call', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Initiate outbound call through selected provider
   */
  async initiateOutboundCall(clientId, callConfig) {
    try {
      const config = await this.getClientProvider(clientId);
      if (!config) {
        throw new Error(`No provider configured for client: ${clientId}`);
      }

      const provider = this.providers[config.provider_name];
      if (!provider) {
        throw new Error(`Unknown provider: ${config.provider_name}`);
      }

      // Decrypt credentials
      const credentials = this.decryptCredentials(config.credentials);

      // Check circuit breaker
      if (!this.circuitBreakers[config.provider_name].isAllowed()) {
        logger.warn('Provider circuit breaker open, attempting failover', { clientId });
        return await this.failoverToBackupProvider(clientId, 'Circuit breaker open');
      }

      try {
        const result = await withTimeout(
          async () => provider.initiateOutboundCall(callConfig, credentials),
          30000,
          `Outbound call initiation for ${config.provider_name}`
        );

        this.circuitBreakers[config.provider_name].recordSuccess();

        // Log the call
        await this.logCall(clientId, config.provider_name, callConfig, result);

        return result;
      } catch (error) {
        this.circuitBreakers[config.provider_name].recordFailure();

        // Try failover if available
        if (config.backup_provider) {
          logger.info('Primary provider failed, attempting failover', { clientId });
          return await this.failoverToBackupProvider(clientId, error.message);
        }

        throw error;
      }
    } catch (error) {
      logger.error('Error initiating outbound call', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Failover to backup provider
   */
  async failoverToBackupProvider(clientId, failureReason) {
    try {
      const config = await this.getClientProvider(clientId);
      if (!config?.backup_provider) {
        throw new Error('No backup provider available');
      }

      logger.info('Failing over to backup provider', { clientId, backup: config.backup_provider });

      // Update to use backup as primary
      const query = `
        UPDATE telephony_config
        SET 
          provider_name = $1,
          credentials = $2,
          backup_provider = NULL,
          backup_credentials = NULL,
          error_count = error_count + 1
        WHERE client_id = $3
        RETURNING *
      `;

      const result = await db.query(query, [
        config.backup_provider,
        config.backup_credentials,
        clientId
      ]);

      // Log failover
      await this.logAudit(clientId, 'provider_failover', config.backup_provider, {
        reason: failureReason,
        from: config.provider_name
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failover failed', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Get provider health status
   */
  async getProviderStatus(clientId) {
    try {
      const query = `
        SELECT 
          client_id,
          provider_name,
          is_active,
          tested_at,
          error_count,
          backup_provider,
          last_error
        FROM telephony_config
        WHERE client_id = $1
      `;

      const result = await db.query(query, [clientId]);
      const config = result.rows[0];

      if (!config) {
        return { configured: false };
      }

      const breaker = this.circuitBreakers[config.provider_name];

      return {
        configured: true,
        provider: config.provider_name,
        is_active: config.is_active,
        is_healthy: breaker.state === 'CLOSED',
        circuit_breaker_state: breaker.state,
        error_count: config.error_count,
        last_tested: config.tested_at,
        last_error: config.last_error,
        backup_provider: config.backup_provider,
        consecutive_failures: breaker.consecutiveFailures
      };
    } catch (error) {
      logger.error('Error fetching provider status', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Initialize health checks for all providers
   */
  initializeHealthChecks() {
    setInterval(async () => {
      try {
        const query = 'SELECT DISTINCT client_id FROM telephony_config WHERE is_active = true';
        const result = await db.query(query);

        for (const row of result.rows) {
          await this.checkProviderHealth(row.client_id);
        }
      } catch (error) {
        logger.error('Error in health check loop', { error: error.message });
      }
    }, this.healthCheckInterval);
  }

  /**
   * Check health of provider for a client
   */
  async checkProviderHealth(clientId) {
    try {
      const config = await this.getClientProvider(clientId);
      if (!config) return;

      const provider = this.providers[config.provider_name];
      if (!provider) return;

      const credentials = this.decryptCredentials(config.credentials);
      const isHealthy = await provider.checkHealth(credentials);

      // Update health status
      const query = `
        UPDATE provider_status
        SET 
          is_healthy = $1,
          last_check = NOW(),
          consecutive_failures = CASE 
            WHEN $1 = true THEN 0 
            ELSE consecutive_failures + 1 
          END
        WHERE client_id = $2 AND provider_name = $3
      `;

      await db.query(query, [isHealthy, clientId, config.provider_name]);

      // If too many consecutive failures, trigger failover
      if (!isHealthy && config.backup_provider && config.error_count >= config.failover_threshold) {
        await this.failoverToBackupProvider(clientId, 'Health check failed');
      }
    } catch (error) {
      logger.warn('Error checking provider health', { clientId, error: error.message });
    }
  }

  /**
   * Encrypt sensitive credentials
   */
  encryptCredentials(credentials) {
    // Implementation would use crypto library
    // For now, returning stringified + base64
    return Buffer.from(JSON.stringify(credentials)).toString('base64');
  }

  /**
   * Decrypt credentials
   */
  decryptCredentials(encrypted) {
    // Implementation would use crypto library
    return JSON.parse(Buffer.from(encrypted, 'base64').toString('utf-8'));
  }

  /**
   * Log audit trail
   */
  async logAudit(clientId, action, provider, metadata = {}) {
    try {
      const query = `
        INSERT INTO audit_log (client_id, action, affected_resource, metadata, timestamp)
        VALUES ($1, $2, $3, $4, NOW())
      `;

      await db.query(query, [
        clientId,
        action,
        `provider:${provider}`,
        JSON.stringify(metadata)
      ]);
    } catch (error) {
      logger.warn('Failed to log audit', { error: error.message });
    }
  }

  /**
   * Log call for billing
   */
  async logCall(clientId, provider, callConfig, result) {
    try {
      const query = `
        INSERT INTO call_billing (
          client_id,
          provider,
          call_type,
          phone_number,
          duration,
          cost,
          status,
          external_call_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await db.query(query, [
        clientId,
        provider,
        callConfig.type,
        callConfig.phone_number,
        0, // Will be updated when call ends
        0,
        'initiated',
        result.call_id
      ]);
    } catch (error) {
      logger.warn('Failed to log call', { error: error.message });
    }
  }

  /**
   * Get call history for provider
   */
  async getCallHistory(clientId, providerName, limit = 50) {
    try {
      const query = `
        SELECT 
          id,
          provider,
          phone_number,
          duration,
          cost,
          status,
          created_at
        FROM call_billing
        WHERE client_id = $1 AND provider = $2
        ORDER BY created_at DESC
        LIMIT $3
      `;

      const result = await db.query(query, [clientId, providerName, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching call history', { clientId, error: error.message });
      throw error;
    }
  }
}

module.exports = new TelephonyRouter();
