/**
 * Custom Provider Handler
 * Generic handler for customer's own VoIP provider
 */

const axios = require('axios');
const crypto = require('crypto');
const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

class CustomProvider {
  /**
   * Test connection to custom provider
   */
  async testConnection(credentials) {
    try {
      const response = await axios.get(
        `${credentials.provider_url}/api/test`,
        {
          headers: {
            'Authorization': `Bearer ${credentials.api_key}`,
            'X-Webhook-Secret': credentials.webhook_secret || ''
          },
          timeout: 5000
        }
      );

      return {
        success: true,
        provider_status: response.data?.status,
        api_version: response.data?.version
      };
    } catch (error) {
      throw new Error(`Custom provider connection failed: ${error.message}`);
    }
  }

  /**
   * Check provider health
   */
  async checkHealth(credentials) {
    try {
      await this.testConnection(credentials);
      return true;
    } catch (error) {
      logger.warn('Custom provider health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Handle inbound call
   */
  async handleInboundCall(callData, credentials) {
    try {
      logger.info('Handling inbound custom provider call', { callData });

      // Custom provider data structure (customer defines)
      const parsedCall = {
        call_id: callData.call_id || callData.callId,
        from: callData.from || callData.caller,
        to: callData.to || callData.callee,
        call_type: 'inbound',
        direction: 'inbound',
        provider: 'custom',
        raw_data: callData
      };

      return parsedCall;
    } catch (error) {
      logger.error('Error handling inbound call', { error: error.message });
      throw error;
    }
  }

  /**
   * Initiate outbound call
   */
  async initiateOutboundCall(callConfig, credentials) {
    try {
      const payload = {
        to: callConfig.to_number,
        from: callConfig.from_number,
        callerId: callConfig.caller_id,
        customData: callConfig.custom_data || {},
        webhookUrl: callConfig.webhook_url,
        statusCallbackUrl: callConfig.status_callback_url
      };

      const response = await axios.post(
        `${credentials.provider_url}/api/calls/initiate`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${credentials.api_key}`,
            'X-Webhook-Secret': credentials.webhook_secret || ''
          },
          timeout: 10000
        }
      );

      logger.info('Outbound call initiated via custom provider', { callId: response.data?.callId });

      return {
        success: true,
        call_id: response.data?.callId || response.data?.call_id,
        provider: 'custom',
        status: response.data?.status || 'initiated'
      };
    } catch (error) {
      logger.error('Error initiating outbound call', { error: error.message });
      throw new Error(`Custom provider call initiation failed: ${error.message}`);
    }
  }

  /**
   * End a call
   */
  async endCall(callId, credentials) {
    try {
      await axios.post(
        `${credentials.provider_url}/api/calls/${callId}/hangup`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${credentials.api_key}`,
            'X-Webhook-Secret': credentials.webhook_secret || ''
          }
        }
      );

      logger.info('Call ended via custom provider', { callId });
      return { success: true };
    } catch (error) {
      logger.error('Error ending call', { error: error.message });
      throw error;
    }
  }

  /**
   * Get call details
   */
  async getCallDetails(callId, credentials) {
    try {
      const response = await axios.get(
        `${credentials.provider_url}/api/calls/${callId}`,
        {
          headers: {
            'Authorization': `Bearer ${credentials.api_key}`,
            'X-Webhook-Secret': credentials.webhook_secret || ''
          }
        }
      );

      return {
        call_id: response.data?.callId || response.data?.call_id,
        status: response.data?.status,
        duration: response.data?.duration,
        from: response.data?.from,
        to: response.data?.to
      };
    } catch (error) {
      logger.error('Error fetching call details', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate webhook signature (if provider signs webhooks)
   */
  validateWebhookSignature(payload, signature, secret) {
    if (!secret) return true; // Skip if no secret configured

    const hash = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return hash === signature;
  }

  /**
   * Send SMS via custom provider
   */
  async sendSMS(to, message, from, credentials) {
    try {
      const response = await axios.post(
        `${credentials.provider_url}/api/sms/send`,
        {
          to,
          from,
          message
        },
        {
          headers: {
            'Authorization': `Bearer ${credentials.api_key}`,
            'X-Webhook-Secret': credentials.webhook_secret || ''
          }
        }
      );

      logger.info('SMS sent via custom provider', { smsId: response.data?.smsId });

      return {
        success: true,
        sms_id: response.data?.smsId
      };
    } catch (error) {
      logger.error('Error sending SMS', { error: error.message });
      throw error;
    }
  }
}

module.exports = CustomProvider;
