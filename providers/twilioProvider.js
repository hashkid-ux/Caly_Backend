/**
 * Twilio Provider Handler
 * Integrates with Twilio communication platform
 */

const twilio = require('twilio');
const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

class TwilioProvider {
  constructor() {
    this.client = null; // Will be initialized per request with credentials
  }

  /**
   * Initialize Twilio client with credentials
   */
  initializeClient(credentials) {
    return twilio(credentials.account_sid, credentials.auth_token);
  }

  /**
   * Test connection to Twilio
   */
  async testConnection(credentials) {
    try {
      const client = this.initializeClient(credentials);
      
      const account = await client.api.accounts(credentials.account_sid).fetch();

      return {
        success: true,
        account_name: account.friendlyName,
        account_type: account.type,
        status: account.status
      };
    } catch (error) {
      throw new Error(`Twilio connection failed: ${error.message}`);
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
      logger.warn('Twilio health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Handle inbound call
   */
  async handleInboundCall(callData, credentials) {
    try {
      logger.info('Handling inbound Twilio call', { callData });

      // Parse Twilio webhook data
      const parsedCall = {
        call_id: callData.CallSid,
        from: callData.From,
        to: callData.To,
        call_type: 'inbound',
        account_sid: callData.AccountSid,
        direction: callData.Direction,
        provider: 'twilio'
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
      const client = this.initializeClient(credentials);

      const call = await client.calls.create({
        to: callConfig.to_number,
        from: callConfig.from_number,
        url: callConfig.webhook_url || `https://your-domain.com/api/webhooks/twilio/${callConfig.client_id}`,
        method: 'POST',
        statusCallback: callConfig.status_callback_url,
        statusCallbackMethod: 'POST',
        statusCallbackEvents: ['initiated', 'ringing', 'answered', 'completed'],
        timeout: 60,
        machineDetection: 'Enable',
        asyncAmd: 'true'
      });

      logger.info('Outbound call initiated via Twilio', { callId: call.sid });

      return {
        success: true,
        call_id: call.sid,
        provider: 'twilio',
        status: 'initiated',
        date_created: call.dateCreated
      };
    } catch (error) {
      logger.error('Error initiating outbound call', { error: error.message });
      throw new Error(`Twilio call initiation failed: ${error.message}`);
    }
  }

  /**
   * End a call
   */
  async endCall(callId, credentials) {
    try {
      const client = this.initializeClient(credentials);

      await client.calls(callId).update({ status: 'completed' });

      logger.info('Call ended via Twilio', { callId });
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
      const client = this.initializeClient(credentials);

      const call = await client.calls(callId).fetch();

      return {
        call_id: call.sid,
        status: call.status,
        duration: call.duration,
        from: call.from,
        to: call.to,
        direction: call.direction,
        date_created: call.dateCreated,
        date_ended: call.dateUpdated
      };
    } catch (error) {
      logger.error('Error fetching call details', { error: error.message });
      throw error;
    }
  }

  /**
   * Send SMS via Twilio
   */
  async sendSMS(to, message, from, credentials) {
    try {
      const client = this.initializeClient(credentials);

      const sms = await client.messages.create({
        body: message,
        from: from,
        to: to
      });

      logger.info('SMS sent via Twilio', { smsId: sms.sid });

      return {
        success: true,
        sms_id: sms.sid
      };
    } catch (error) {
      logger.error('Error sending SMS', { error: error.message });
      throw error;
    }
  }

  /**
   * List available phone numbers
   */
  async getPhoneNumbers(credentials) {
    try {
      const client = this.initializeClient(credentials);

      const incomingPhoneNumbers = await client.incomingPhoneNumbers.list();

      return incomingPhoneNumbers.map(phone => ({
        phone_number: phone.phoneNumber,
        friendly_name: phone.friendlyName,
        capabilities: phone.capabilities
      }));
    } catch (error) {
      logger.error('Error fetching phone numbers', { error: error.message });
      throw error;
    }
  }
}

module.exports = TwilioProvider;
