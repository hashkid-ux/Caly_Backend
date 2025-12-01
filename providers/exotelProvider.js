/**
 * Exotel Provider Handler
 * Integrates with Exotel VoIP platform
 */

const axios = require('axios');
const logger = require('../../utils/logger');

class ExotelProvider {
  constructor() {
    this.baseURL = 'https://api.exotel.com/v2';
  }

  /**
   * Test connection to Exotel
   */
  async testConnection(credentials) {
    try {
      const response = await axios.get(
        `${this.baseURL}/accounts/${credentials.account_sid}`,
        {
          auth: {
            username: credentials.account_sid,
            password: credentials.auth_token
          }
        }
      );

      return {
        success: true,
        account_name: response.data?.account?.name,
        timezone: response.data?.account?.timezone
      };
    } catch (error) {
      throw new Error(`Exotel connection failed: ${error.response?.data?.error || error.message}`);
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
      logger.warn('Exotel health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Handle inbound call
   */
  async handleInboundCall(callData, credentials) {
    try {
      logger.info('Handling inbound Exotel call', { callData });

      // Parse Exotel webhook data
      const parsedCall = {
        call_id: callData.CallSid,
        from: callData.From,
        to: callData.To,
        call_type: 'inbound',
        timestamp: new Date(callData.CallStartTime),
        provider: 'exotel'
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
      const response = await axios.post(
        `${this.baseURL}/accounts/${credentials.account_sid}/calls`,
        {
          From: callConfig.from_number,
          To: callConfig.to_number,
          CallerId: callConfig.caller_id || callConfig.from_number,
          CustomData: callConfig.custom_data || {}
        },
        {
          auth: {
            username: credentials.account_sid,
            password: credentials.auth_token
          }
        }
      );

      logger.info('Outbound call initiated via Exotel', { response });

      return {
        success: true,
        call_id: response.data?.Call?.Sid,
        provider: 'exotel',
        status: 'initiated'
      };
    } catch (error) {
      logger.error('Error initiating outbound call', { error: error.message });
      throw new Error(`Exotel call initiation failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * End a call
   */
  async endCall(callId, credentials) {
    try {
      await axios.post(
        `${this.baseURL}/accounts/${credentials.account_sid}/calls/${callId}/hangup`,
        {},
        {
          auth: {
            username: credentials.account_sid,
            password: credentials.auth_token
          }
        }
      );

      logger.info('Call ended via Exotel', { callId });
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
        `${this.baseURL}/accounts/${credentials.account_sid}/calls/${callId}`,
        {
          auth: {
            username: credentials.account_sid,
            password: credentials.auth_token
          }
        }
      );

      return {
        call_id: response.data?.Call?.Sid,
        status: response.data?.Call?.Status,
        duration: response.data?.Call?.Duration,
        from: response.data?.Call?.From,
        to: response.data?.Call?.To,
        recording_url: response.data?.Call?.RecordingUrl
      };
    } catch (error) {
      logger.error('Error fetching call details', { error: error.message });
      throw error;
    }
  }

  /**
   * Send SMS (Exotel also supports SMS)
   */
  async sendSMS(to, message, credentials) {
    try {
      const response = await axios.post(
        `${this.baseURL}/accounts/${credentials.account_sid}/sms`,
        {
          From: callConfig.from_number,
          To: to,
          Body: message
        },
        {
          auth: {
            username: credentials.account_sid,
            password: credentials.auth_token
          }
        }
      );

      return {
        success: true,
        sms_id: response.data?.Sms?.Sid
      };
    } catch (error) {
      logger.error('Error sending SMS', { error: error.message });
      throw error;
    }
  }
}

module.exports = ExotelProvider;
