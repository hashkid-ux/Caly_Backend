// Backend/utils/encryption.js - AES-256 encryption for sensitive data
const crypto = require('crypto');
const logger = require('./logger');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 64) {
  logger.warn('⚠️  ENCRYPTION_KEY not set or too short. Encryption disabled. Set ENCRYPTION_KEY to 32-byte hex string.');
}

/**
 * Encrypt sensitive data (Shopify API secrets, Exotel tokens, etc.)
 * @param {string} plaintext - Data to encrypt
 * @returns {string} - Encrypted data in format: iv:encryptedData
 */
function encrypt(plaintext) {
  if (!ENCRYPTION_KEY) {
    logger.error('ENCRYPTION_KEY not configured');
    throw new Error('ENCRYPTION_KEY environment variable not set');
  }

  try {
    // Generate random IV (initialization vector)
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    
    // Encrypt data
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return iv:encrypted format
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    logger.error('Encryption failed', { error: error.message });
    throw error;
  }
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted data in format: iv:encryptedData
 * @returns {string} - Decrypted plaintext
 */
function decrypt(encryptedData) {
  if (!ENCRYPTION_KEY) {
    logger.error('ENCRYPTION_KEY not configured');
    throw new Error('ENCRYPTION_KEY environment variable not set');
  }

  try {
    // Split iv and encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

    // Decrypt data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logger.error('Decryption failed', { error: error.message });
    throw error;
  }
}

/**
 * Test encryption/decryption (for verification)
 * @returns {boolean} - True if encryption works
 */
function testEncryption() {
  if (!ENCRYPTION_KEY) {
    logger.warn('Encryption test skipped - ENCRYPTION_KEY not set');
    return false;
  }

  try {
    const testData = 'test-secret-data-12345';
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);

    if (decrypted === testData) {
      logger.info('✅ Encryption test passed');
      return true;
    } else {
      logger.error('❌ Encryption test failed - decrypted data mismatch');
      return false;
    }
  } catch (error) {
    logger.error('❌ Encryption test failed', { error: error.message });
    return false;
  }
}

module.exports = {
  encrypt,
  decrypt,
  testEncryption
};
