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
// ✅ PHASE 2 FIX 4: Add input validation (supports optional Shopify/Exotel with skip flags)
router.post('/complete', authMiddleware, validateBody(commonSchemas.onboardingCompleteSchema), async (req, res) => {
  try {
    const client_id = req.user.client_id;
    const {
      companyName,
      skipShopify,
      shopifyStore,
      shopifyApiKey,
      shopifyApiSecret,
      skipExotel,
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

    const errors = {};

    // ✅ NEW: Validate Shopify only if not skipped
    if (!skipShopify) {
      if (!shopifyStore) errors.shopifyStore = 'Store URL required';
      if (!shopifyApiKey) errors.shopifyApiKey = 'API Key required';
      if (!shopifyApiSecret) errors.shopifyApiSecret = 'API Secret required';
    }

    // ✅ NEW: Validate Exotel only if not skipped
    if (!skipExotel) {
      if (!exotelNumber) errors.exotelNumber = 'Phone number required';
      if (!exotelSid) errors.exotelSid = 'Exotel SID required';
      if (!exotelToken) errors.exotelToken = 'Exotel Token required';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    // ✅ NEW: Validate Shopify credentials only if Shopify is configured
    let encryptedShopifySecret = null;
    if (!skipShopify && shopifyStore && shopifyApiKey && shopifyApiSecret) {
      logger.info('Validating Shopify credentials', { store: shopifyStore });
      const shopifyValid = await validateShopifyCredentials(shopifyApiKey, shopifyApiSecret, shopifyStore);
      
      if (!shopifyValid) {
        return res.status(400).json({ 
          error: 'Invalid Shopify credentials. Please check your API Key and Secret.' 
        });
      }
      encryptedShopifySecret = encrypt(shopifyApiSecret);
    }

    // ✅ NEW: Validate Exotel credentials only if Exotel is configured
    let encryptedExotelToken = null;
    if (!skipExotel && exotelSid && exotelToken) {
      logger.info('Validating Exotel credentials', { sid: exotelSid });
      const exotelValid = await validateExotelCredentials(exotelSid, exotelToken);
      
      if (!exotelValid) {
        return res.status(400).json({ 
          error: 'Invalid Exotel credentials. Please check your SID and Token.' 
        });
      }
      encryptedExotelToken = encrypt(exotelToken);
    }

    // Update client with all configuration
    const query = `
      UPDATE clients 
      SET 
        name = COALESCE($1, name),
        shopify_store_url = $2,
        shopify_api_key = $3,
        shopify_api_secret = $4,
        exotel_number = $5,
        exotel_sid = $6,
        exotel_token = $7,
        return_window_days = $8,
        refund_auto_threshold = $9,
        cancel_window_hours = $10,
        escalation_threshold = $11,
        enable_whatsapp = $12,
        enable_sms = $13,
        enable_email = $14,
        updated_at = NOW()
      WHERE id = $15
      RETURNING id, shopify_store_url, exotel_number
    `;

    const result = await db.query(query, [
      companyName || null,
      skipShopify ? null : shopifyStore,
      skipShopify ? null : shopifyApiKey,
      skipShopify ? null : encryptedShopifySecret,
      skipExotel ? null : exotelNumber,
      skipExotel ? null : exotelSid,
      skipExotel ? null : encryptedExotelToken,
      returnWindowDays || 14,
      refundAutoThreshold || 2000,
      cancelWindowHours || 24,
      escalationThreshold || 60,
      enableWhatsApp || false,
      enableSMS !== false,
      enableEmail !== false,
      client_id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    logger.info('Onboarding completed', { 
      client_id, 
      skipShopify,
      skipExotel,
      store: skipShopify ? 'SKIPPED' : shopifyStore,
      exotel_number: skipExotel ? 'SKIPPED' : exotelNumber
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
