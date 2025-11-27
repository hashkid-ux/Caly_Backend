// Backend/services/wasabiStorage.js - Wasabi S3-Compatible Storage (HTTP Only - No AWS SDK)
const axios = require('axios');
const logger = require('../utils/logger');
const { executeWithTimeoutAndRetry } = require('../utils/timeoutUtil');

// 🔒 TIMEOUT CONFIGURATION
const WASABI_UPLOAD_TIMEOUT = 60000; // 60 seconds for large files
const WASABI_DOWNLOAD_TIMEOUT = 60000; // 60 seconds for large files
const WASABI_DELETE_TIMEOUT = 30000; // 30 seconds for delete
const WASABI_LIST_TIMEOUT = 30000; // 30 seconds for list

class WasabiStorage {
  constructor() {
    this.endpoint = process.env.WASABI_ENDPOINT || 'https://s3.us-west-1.wasabisys.com';
    this.accessKeyId = process.env.WASABI_ACCESS_KEY_ID;
    this.secretAccessKey = process.env.WASABI_SECRET_ACCESS_KEY;
    this.bucketName = process.env.WASABI_BUCKET || 'caly-call-recordings';
    this.region = process.env.WASABI_REGION || 'us-west-1';

    this.enabled = !!(this.accessKeyId && this.secretAccessKey && this.bucketName);

    if (this.enabled) {
      logger.info('✅ Wasabi storage initialized (HTTP - No AWS SDK)', {
        bucket: this.bucketName,
        endpoint: this.endpoint,
      });
    } else {
      logger.warn('⚠️  Wasabi storage disabled - set WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, WASABI_BUCKET');
    }
  }

  /**
   * Upload call recording to Wasabi using HTTP PUT
   */
  async uploadCallRecording(callId, audioBuffer, format = 'mp3') {
    if (!this.enabled) {
      logger.warn('Wasabi disabled - recording not uploaded', { callId });
      return null;
    }

    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `recordings/${timestamp}/${callId}.${format}`;

      logger.info('📤 Uploading to Wasabi', {
        callId,
        fileName,
        size: `${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`,
      });

      const uploadUrl = `${this.endpoint}/${this.bucketName}/${fileName}`;

      const response = await axios.put(uploadUrl, audioBuffer, {
        headers: {
          'Content-Type': `audio/${format}`,
        },
        auth: {
          username: this.accessKeyId,
          password: this.secretAccessKey,
        },
        timeout: 60000,
      });

      const publicUrl = `${this.endpoint}/${this.bucketName}/${fileName}`;

      logger.info('✅ Recording uploaded to Wasabi', {
        callId,
        url: publicUrl,
        statusCode: response.status,
      });

      return publicUrl;
    } catch (error) {
      logger.error('❌ Wasabi upload failed', {
        callId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Download call recording from Wasabi using HTTP GET
   */
  async downloadCallRecording(recordingUrl) {
    if (!this.enabled) {
      logger.warn('Wasabi disabled - cannot download recording');
      return null;
    }

    try {
      logger.info('📥 Downloading from Wasabi', { url: recordingUrl });

      const response = await axios.get(recordingUrl, {
        auth: {
          username: this.accessKeyId,
          password: this.secretAccessKey,
        },
        timeout: 60000,
        responseType: 'arraybuffer',
      });

      const audioBuffer = response.data;

      logger.info('✅ Downloaded from Wasabi', {
        size: `${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`,
      });

      return audioBuffer;
    } catch (error) {
      logger.error('❌ Wasabi download failed', {
        url: recordingUrl,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete call recording from Wasabi using HTTP DELETE
   */
  async deleteCallRecording(recordingUrl) {
    if (!this.enabled) {
      logger.warn('Wasabi disabled - cannot delete recording');
      return false;
    }

    try {
      logger.info('🗑️  Deleting from Wasabi', { url: recordingUrl });

      const response = await axios.delete(recordingUrl, {
        auth: {
          username: this.accessKeyId,
          password: this.secretAccessKey,
        },
        timeout: 30000,
      });

      logger.info('✅ Deleted from Wasabi', {
        statusCode: response.status,
      });
      return true;
    } catch (error) {
      logger.error('❌ Wasabi delete failed', {
        url: recordingUrl,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check Wasabi connection using HTTP HEAD
   */
  async checkConnection() {
    if (!this.enabled) {
      logger.warn('Wasabi not configured');
      return false;
    }

    try {
      const testUrl = `${this.endpoint}/${this.bucketName}`;

      const response = await axios.head(testUrl, {
        auth: {
          username: this.accessKeyId,
          password: this.secretAccessKey,
        },
        timeout: 10000,
      });

      logger.info('✅ Wasabi connection verified', {
        endpoint: this.endpoint,
        statusCode: response.status,
      });
      return true;
    } catch (error) {
      logger.error('❌ Wasabi connection failed', {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * List recordings in bucket
   */
  async listRecordings(startDate, endDate) {
    if (!this.enabled) {
      logger.warn('Wasabi disabled - cannot list recordings');
      return [];
    }

    try {
      logger.info('📋 Listing recordings from Wasabi', { startDate, endDate });

      const listUrl = `${this.endpoint}/${this.bucketName}/?prefix=recordings/&max-keys=1000`;

      const response = await axios.get(listUrl, {
        auth: {
          username: this.accessKeyId,
          password: this.secretAccessKey,
        },
        timeout: 30000,
      });

      logger.info('✅ Recordings listed', {
        bytes: response.data.length,
      });

      return response.data;
    } catch (error) {
      logger.error('❌ Failed to list recordings', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    if (!this.enabled) {
      return { enabled: false, message: 'Wasabi storage disabled' };
    }

    try {
      logger.info('📊 Getting Wasabi storage stats');

      const isConnected = await this.checkConnection();

      return {
        enabled: true,
        connected: isConnected,
        bucket: this.bucketName,
        endpoint: this.endpoint,
        region: this.region,
      };
    } catch (error) {
      logger.error('❌ Failed to get storage stats', {
        error: error.message,
      });
      return { enabled: true, connected: false, error: error.message };
    }
  }
}

module.exports = new WasabiStorage();
