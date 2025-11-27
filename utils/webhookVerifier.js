const crypto = require('crypto');
const logger = require('./logger');

/**
 * Webhook Signature Verifier
 * Validates webhook signatures to prevent spoofing
 * Supports HMAC-SHA256, HMAC-SHA1, MD5 algorithms
 * 
 * Usage:
 *   app.post('/webhook', WebhookVerifier.middleware('secret_key'));
 */

class WebhookVerifier {
  /**
   * Verify webhook signature using HMAC
   * Timing-safe comparison prevents timing attacks
   * 
   * @static
   * @param {string} secret - Shared secret between sender and receiver
   * @param {string|Object} payload - Request body as string or object
   * @param {string} signature - Signature from webhook header
   * @param {string} algorithm - Hash algorithm (default: sha256)
   * @returns {boolean} True if signature is valid
   */
  static verifyHMAC(secret, payload, signature, algorithm = 'sha256') {
    try {
      // Normalize payload (ensure it's a string)
      const payloadStr = typeof payload === 'string' 
        ? payload 
        : JSON.stringify(payload);

      // Generate expected signature
      const hash = crypto
        .createHmac(algorithm, secret)
        .update(payloadStr)
        .digest('hex');

      // Timing-safe comparison (prevents timing attacks)
      return crypto.timingSafeEqual(
        Buffer.from(hash),
        Buffer.from(signature)
      );
    } catch (error) {
      logger.error('Webhook verification error:', error);
      return false;
    }
  }

  /**
   * Express middleware for webhook verification
   * Validates signature before processing webhook
   * 
   * @static
   * @param {string} secret - Shared secret
   * @param {string} algorithm - Hash algorithm (default: sha256)
   * @param {string} signatureHeader - Header name containing signature (default: x-signature)
   * @returns {Function} Express middleware
   * 
   * Usage:
   *   app.post('/webhook/exotel', 
   *     WebhookVerifier.middleware('my_secret'),
   *     exotelRoutes.handleWebhook
   *   );
   */
  static middleware(secret, algorithm = 'sha256', signatureHeader = 'x-signature') {
    return (req, res, next) => {
      const signature = req.get(signatureHeader);

      // Check if signature header is present
      if (!signature) {
        logger.warn('Webhook missing signature header', {
          headers: Object.keys(req.headers),
          expectedHeader: signatureHeader,
        });
        return res.status(401).json({ 
          error: 'Missing signature',
          code: 'MISSING_SIGNATURE'
        });
      }

      // Get raw body for verification
      let body = req.body;
      
      // If body is parsed object, stringify it
      if (typeof body === 'object') {
        body = JSON.stringify(body);
      }

      // Verify signature
      const isValid = WebhookVerifier.verifyHMAC(
        secret,
        body,
        signature,
        algorithm
      );

      if (!isValid) {
        logger.warn('Webhook signature verification failed', {
          algorithm,
          expectedLength: 64, // sha256 hex length
          receivedLength: signature ? signature.length : 0,
        });
        return res.status(401).json({ 
          error: 'Invalid signature',
          code: 'INVALID_SIGNATURE'
        });
      }

      // Signature valid, continue processing
      logger.debug('Webhook signature verified', { signatureHeader });
      next();
    };
  }

  /**
   * Generate signature for testing/debugging
   * Useful for validating webhook payloads before sending
   * 
   * @static
   * @param {string} secret - Shared secret
   * @param {string|Object} payload - Request body
   * @param {string} algorithm - Hash algorithm (default: sha256)
   * @returns {string} Generated signature (hex)
   * 
   * Usage:
   *   const sig = WebhookVerifier.generateSignature(secret, payload);
   */
  static generateSignature(secret, payload, algorithm = 'sha256') {
    const payloadStr = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload);

    return crypto
      .createHmac(algorithm, secret)
      .update(payloadStr)
      .digest('hex');
  }

  /**
   * Validate webhook signature from headers
   * Higher-level function combining verification
   * 
   * @static
   * @param {Object} headers - Request headers
   * @param {string|Object} body - Request body
   * @param {string} secret - Shared secret
   * @param {Object} options - Configuration options
   * @returns {Object} Validation result {valid: boolean, error?: string}
   */
  static validate(headers, body, secret, options = {}) {
    const {
      algorithm = 'sha256',
      signatureHeader = 'x-signature',
    } = options;

    const signature = headers[signatureHeader];

    if (!signature) {
      return {
        valid: false,
        error: `Missing ${signatureHeader} header`,
      };
    }

    const isValid = this.verifyHMAC(secret, body, signature, algorithm);

    if (!isValid) {
      return {
        valid: false,
        error: 'Signature verification failed',
      };
    }

    return { valid: true };
  }
}

module.exports = WebhookVerifier;
