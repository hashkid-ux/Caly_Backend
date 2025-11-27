// Backend/routes/onboarding.js - Client onboarding setup
const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));
const db = require(resolve('db/postgres'));
const { authMiddleware } = require(resolve('auth/authMiddleware'));
const { encrypt, decrypt } = require(resolve('utils/encryption'));
const { validateBody, commonSchemas } = require(resolve('middleware/validation')); // ✅ PHASE 2 FIX 4

// Validate Shopify credentials
async function validateShopifyCredentials(apiKey, apiSecret, storeUrl) {
  try {
    const response = await fetch(
      `https://${storeUrl}/admin/api/2024-01/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': apiSecret
        }
      }
    );
    return response.ok;
  } catch (error) {
    logger.error('Shopify validation error:', error);
    return false;
  }
}

// Validate Exotel credentials
async function validateExotelCredentials(sid, token) {
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const response = await fetch(
      `https://api.exotel.com/v2/accounts/${sid}/user`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );
    return response.ok;
  } catch (error) {
    logger.error('Exotel validation error:', error);
    return false;
  }
}

// GET - Check onboarding status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const client_id = req.user.client_id;

    const result = await db.query(
      `SELECT 
        shopify_api_key, 
        exotel_number,
        is_configured,
        onboarding_completed_at
      FROM clients 
      WHERE id = $1`,
      [client_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = result.rows[0];
    res.json({
      isConfigured: client.is_configured,
      hasShopify: !!client.shopify_api_key,
      hasExotel: !!client.exotel_number,
      completedAt: client.onboarding_completed_at
    });
  } catch (error) {
    logger.error('Onboarding status error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// POST - Complete onboarding setup
// ✅ PHASE 2 FIX 4: Add input validation
router.post('/complete', authMiddleware, validateBody(commonSchemas.onboardingCompleteSchema), async (req, res) => {
  try {
    const client_id = req.user.client_id;
    const {
      shopifyStore,
      shopifyApiKey,
      shopifyApiSecret,
      exotelNumber,
      exotelSid,
      exotelToken,
      returnWindowDays,
      refundAutoThreshold,
      cancelWindowHours,
      escalationThreshold,
      enableWhatsApp,
      enableSMS,
      enableEmail
    } = req.body;

    // Note: validateBody middleware already validated required fields,
    // but we still do credential validation below

    if (!shopifyStore) errors.shopifyStore = 'Store URL required';
    if (!shopifyApiKey) errors.shopifyApiKey = 'API Key required';
    if (!shopifyApiSecret) errors.shopifyApiSecret = 'API Secret required';
    if (!exotelNumber) errors.exotelNumber = 'Phone number required';
    if (!exotelSid) errors.exotelSid = 'Exotel SID required';
    if (!exotelToken) errors.exotelToken = 'Exotel Token required';

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    // Validate Shopify credentials
    logger.info('Validating Shopify credentials', { store: shopifyStore });
    const shopifyValid = await validateShopifyCredentials(shopifyApiKey, shopifyApiSecret, shopifyStore);
    
    if (!shopifyValid) {
      return res.status(400).json({ 
        error: 'Invalid Shopify credentials. Please check your API Key and Secret.' 
      });
    }

    // Validate Exotel credentials
    logger.info('Validating Exotel credentials', { sid: exotelSid });
    const exotelValid = await validateExotelCredentials(exotelSid, exotelToken);
    
    if (!exotelValid) {
      return res.status(400).json({ 
        error: 'Invalid Exotel credentials. Please check your SID and Token.' 
      });
    }

    // Encrypt sensitive data
    const encryptedShopifySecret = encrypt(shopifyApiSecret);
    const encryptedExotelToken = encrypt(exotelToken);

    // Update client with all configuration
    const query = `
      UPDATE clients 
      SET 
        shopify_store = $1,
        shopify_api_key = $2,
        shopify_api_secret_encrypted = $3,
        exotel_number = $4,
        exotel_sid = $5,
        exotel_token_encrypted = $6,
        return_window_days = $7,
        refund_auto_threshold = $8,
        cancel_window_hours = $9,
        escalation_threshold = $10,
        enable_whatsapp = $11,
        enable_sms = $12,
        enable_email = $13,
        is_configured = true,
        onboarding_completed_at = NOW()
      WHERE id = $14
      RETURNING id, shopify_store, exotel_number
    `;

    const result = await db.query(query, [
      shopifyStore,
      shopifyApiKey,
      encryptedShopifySecret,
      exotelNumber,
      exotelSid,
      encryptedExotelToken,
      returnWindowDays,
      refundAutoThreshold,
      cancelWindowHours,
      escalationThreshold,
      enableWhatsApp,
      enableSMS,
      enableEmail,
      client_id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    logger.info('Onboarding completed', { 
      client_id, 
      store: shopifyStore,
      exotel_number: exotelNumber 
    });

    res.json({
      success: true,
      message: 'Setup completed successfully!',
      client: result.rows[0]
    });

  } catch (error) {
    logger.error('Onboarding error:', error);
    res.status(500).json({ 
      error: 'Failed to complete setup. Please try again.' 
    });
  }
});

// POST - Test integration connection
router.post('/test-shopify', authMiddleware, async (req, res) => {
  try {
    const { shopifyStore, shopifyApiKey, shopifyApiSecret } = req.body;

    if (!shopifyStore || !shopifyApiKey || !shopifyApiSecret) {
      return res.status(400).json({ 
        error: 'All Shopify credentials required' 
      });
    }

    const isValid = await validateShopifyCredentials(shopifyApiKey, shopifyApiSecret, shopifyStore);

    if (isValid) {
      res.json({ 
        success: true, 
        message: 'Shopify credentials are valid!' 
      });
    } else {
      res.status(400).json({ 
        error: 'Invalid Shopify credentials. Check your API Key and Secret.' 
      });
    }
  } catch (error) {
    logger.error('Shopify test error:', error);
    res.status(500).json({ error: 'Failed to test Shopify connection' });
  }
});

// POST - Test Exotel connection
router.post('/test-exotel', authMiddleware, async (req, res) => {
  try {
    const { exotelSid, exotelToken } = req.body;

    if (!exotelSid || !exotelToken) {
      return res.status(400).json({ 
        error: 'Exotel SID and Token required' 
      });
    }

    const isValid = await validateExotelCredentials(exotelSid, exotelToken);

    if (isValid) {
      res.json({ 
        success: true, 
        message: 'Exotel credentials are valid!' 
      });
    } else {
      res.status(400).json({ 
        error: 'Invalid Exotel credentials. Check your SID and Token.' 
      });
    }
  } catch (error) {
    logger.error('Exotel test error:', error);
    res.status(500).json({ error: 'Failed to test Exotel connection' });
  }
});

module.exports = router;
