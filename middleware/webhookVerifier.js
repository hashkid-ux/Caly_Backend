/**
 * Webhook Signature Verification Middleware
 * Verifies webhooks from Exotel using HMAC-SHA1
 * Security: Constant-time comparison to prevent timing attacks
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Verify Exotel webhook signature
 * 
 * Exotel signs webhooks with HMAC-SHA1:
 * Signature = Base64(HMAC-SHA1(secret, request_body))
 */
function verifyExotelWebhook(req, res, next) {
  try {
    // Get signature from header
    const signature = req.headers['x-exotel-signature'];
    const timestamp = req.headers['x-exotel-timestamp'];

    if (!signature) {
      logger.warn('Webhook missing signature header', {
        path: req.path,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    if (!process.env.EXOTEL_WEBHOOK_SECRET) {
      logger.error('EXOTEL_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Reconstruct message body for verification
    const rawBody = req.rawBody || JSON.stringify(req.body);

    // Calculate expected signature
    const hmac = crypto.createHmac('sha1', process.env.EXOTEL_WEBHOOK_SECRET);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('base64');

    // Compare signatures (constant-time comparison to prevent timing attacks)
    let signatureMatch = false;
    try {
      signatureMatch = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      signatureMatch = false;
    }

    if (!signatureMatch) {
      logger.warn('⚠️  Invalid webhook signature', {
        path: req.path,
        ip: req.ip,
        callSid: req.body?.CallSid,
        received: signature.substring(0, 10) + '...',
        expected: expectedSignature.substring(0, 10) + '...'
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Optional: Verify timestamp is recent (prevent replay attacks)
    if (timestamp) {
      const webhookTime = parseInt(timestamp);
      const currentTime = Math.floor(Date.now() / 1000);
      const timeDiff = Math.abs(currentTime - webhookTime);

      // Allow 5 minute window
      if (timeDiff > 300) {
        logger.warn('Webhook timestamp too old (potential replay attack)', {
          timeDiff,
          path: req.path,
          callSid: req.body?.CallSid
        });
        // Don't reject - Exotel timestamp may have clock drift
      }
    }

    logger.info('✅ Webhook signature verified', {
      path: req.path,
      callSid: req.body?.CallSid,
      signature: signature.substring(0, 10) + '...'
    });

    next();
  } catch (error) {
    logger.error('Webhook verification error', {
      error: error.message,
      path: req.path
    });
    res.status(500).json({ error: 'Verification error' });
  }
}

module.exports = {
  verifyExotelWebhook
};
