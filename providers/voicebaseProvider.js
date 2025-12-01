/**
 * VoiceBase Provider Handler
 * For call recording and analytics
 */

const axios = require('axios');
const logger = require('../../utils/logger');

class VoiceBaseProvider {
  constructor() {
    this.baseURL = 'https://api.voicebase.com/v3';
  }

  /**
   * Test connection to VoiceBase
   */
  async testConnection(credentials) {
    try {
      const response = await axios.get(
        `${this.baseURL}/accounts`,
        {
          headers: {
            'Authorization': `Bearer ${credentials.api_key}`
          }
        }
      );

      return {
        success: true,
        account_status: response.data?.accountStatus
      };
    } catch (error) {
      throw new Error(`VoiceBase connection failed: ${error.response?.data?.message || error.message}`);
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
      logger.warn('VoiceBase health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Handle inbound call
   */
  async handleInboundCall(callData, credentials) {
    try {
      logger.info('Handling inbound VoiceBase call', { callData });

      const parsedCall = {
        call_id: callData.mediaId,
        from: callData.from,
        to: callData.to,
        call_type: 'inbound',
        direction: 'inbound',
        provider: 'voicebase'
      };

      return parsedCall;
    } catch (error) {
      logger.error('Error handling inbound call', { error: error.message });
      throw error;
    }
  }

  /**
   * Initiate outbound call (VoiceBase primarily for recording)
   */
  async initiateOutboundCall(callConfig, credentials) {
    try {
      const response = await axios.post(
        `${this.baseURL}/media`,
        {
          mediaUrl: callConfig.media_url,
          title: callConfig.title || 'Call Recording',
          metadata: callConfig.metadata || {}
        },
        {
          headers: {
            'Authorization': `Bearer ${credentials.api_key}`
          }
        }
      );

      logger.info('Recording initiated via VoiceBase', { mediaId: response.data?.mediaId });

      return {
        success: true,
        media_id: response.data?.mediaId,
        provider: 'voicebase',
        status: 'processing'
      };
    } catch (error) {
      logger.error('Error initiating recording', { error: error.message });
      throw new Error(`VoiceBase recording failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get recording/call details
   */
  async getCallDetails(mediaId, credentials) {
    try {
      const response = await axios.get(
        `${this.baseURL}/media/${mediaId}`,
        {
          headers: {
            'Authorization': `Bearer ${credentials.api_key}`
          }
        }
      );

      return {
        media_id: response.data?.mediaId,
        status: response.data?.status,
        duration: response.data?.duration,
        transcript: response.data?.transcript,
        keywords: response.data?.keywords
      };
    } catch (error) {
      logger.error('Error fetching call details', { error: error.message });
      throw error;
    }
  }

  /**
   * Get transcript of recording
   */
  async getTranscript(mediaId, credentials) {
    try {
      const response = await axios.get(
        `${this.baseURL}/media/${mediaId}/transcript`,
        {
          headers: {
            'Authorization': `Bearer ${credentials.api_key}`
          }
        }
      );

      return response.data?.transcript;
    } catch (error) {
      logger.error('Error fetching transcript', { error: error.message });
      throw error;
    }
  }
}

module.exports = VoiceBaseProvider;
