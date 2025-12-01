/**
 * Backend Routes: Settings & Credentials Management
 * Handles dynamic API credential collection per sector
 * REAL implementation - NOT hardcoded!
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const resolve = require('../utils/moduleResolver');
const credentialManager = require(resolve('services/credentialManager'));
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));

/**
 * GET /api/settings/sector/:sector/apis
 * Returns the APIs needed for THIS sector
 */
router.get('/sector/:sector/apis', authMiddleware, async (req, res) => {
  try {
    const { sector } = req.params;
    const apis = await credentialManager.getApisForSector(sector);
    
    return res.json({
      success: true,
      sector,
      apis
    });
  } catch (error) {
    logger.error('Failed to get sector APIs', error);
    return res.status(500).json({ error: 'Failed to get API configurations' });
  }
});

/**
 * GET /api/settings/credentials/:sector
 * Returns saved credentials for a sector (WITHOUT secrets!)
 */
router.get('/credentials/:sector', authMiddleware, async (req, res) => {
  const { client_id } = req.user;
  const { sector } = req.params;

  try {
    const result = await db.query(
      `SELECT 
         api_type, 
         provider_name, 
         verified, 
         status,
         last_verified_at,
         last_used_at
       FROM api_credentials
       WHERE client_id = $1 AND sector = $2
       ORDER BY created_at DESC`,
      [client_id, sector]
    );

    return res.json({
      success: true,
      sector,
      credentials: result.rows
    });
  } catch (error) {
    logger.error('Failed to fetch credentials', { sector, error });
    return res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

/**
 * POST /api/settings/credentials/:sector/:api_type/test
 * Test credential BEFORE saving (verify it actually works!)
 */
router.post('/credentials/:sector/:api_type/test', authMiddleware, async (req, res) => {
  const { sector, api_type } = req.params;
  const { credentials } = req.body;

  if (!credentials) {
    return res.status(400).json({ error: 'Credentials required for testing' });
  }

  try {
    const result = await credentialManager.testCredential(api_type, credentials);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: result.error || `${api_type} credential verification failed`
      });
    }

    return res.json({
      success: true,
      message: `✅ ${sector}/${api_type} credentials verified successfully!`
    });
  } catch (error) {
    logger.error('Credential test failed', { sector, api_type, error });
    return res.status(500).json({
      error: 'Credential test failed',
      details: error.message
    });
  }
});

/**
 * POST /api/settings/credentials/:sector/:api_type/save
 * Save credential (encrypted) after verification
 */
router.post('/credentials/:sector/:api_type/save', authMiddleware, async (req, res) => {
  const { client_id } = req.user;
  const { sector, api_type } = req.params;
  const { credentials, provider_name } = req.body;

  if (!credentials || !provider_name) {
    return res.status(400).json({ error: 'Credentials and provider name required' });
  }

  try {
    // 1. Test credential first
    const testResult = await credentialManager.testCredential(api_type, credentials);
    if (!testResult.valid) {
      return res.status(400).json({
        success: false,
        error: 'Credential verification failed. Please check your credentials.'
      });
    }

    // 2. Store credential (encrypted)
    const credential_id = await credentialManager.storeCredential(
      client_id,
      sector,
      api_type,
      provider_name,
      credentials
    );

    // 3. Update status to verified
    await db.query(
      `UPDATE api_credentials 
       SET verified = true, status = $1, last_verified_at = NOW()
       WHERE id = $2`,
      ['active', credential_id]
    );

    logger.info('✅ Credential saved and verified', {
      client_id,
      sector,
      api_type,
      provider_name
    });

    return res.json({
      success: true,
      credential_id,
      message: '✅ Credential saved and verified!'
    });
  } catch (error) {
    logger.error('Failed to save credential', { sector, api_type, error });
    return res.status(500).json({ error: 'Failed to save credential' });
  }
});

/**
 * DELETE /api/settings/credentials/:credential_id
 * Delete a credential
 */
router.delete('/credentials/:credential_id', authMiddleware, async (req, res) => {
  const { client_id, user_id } = req.user;
  const { credential_id } = req.params;

  try {
    // Verify this credential belongs to this client
    const checkResult = await db.query(
      `SELECT client_id FROM api_credentials WHERE id = $1`,
      [credential_id]
    );

    if (checkResult.rows.length === 0 || checkResult.rows[0].client_id !== client_id) {
      return res.status(403).json({ error: 'Credential not found' });
    }

    // Delete credential
    await db.query('DELETE FROM api_credentials WHERE id = $1', [credential_id]);

    // Audit log
    await db.query(
      `INSERT INTO audit_log (client_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [client_id, user_id, 'DELETE', 'credential', credential_id]
    );

    return res.json({ success: true, message: 'Credential deleted' });
  } catch (error) {
    logger.error('Failed to delete credential', error);
    return res.status(500).json({ error: 'Failed to delete credential' });
  }
});

/**
 * GET /api/settings/provider-types/:sector
 * Get available providers for a sector
 */
router.get('/provider-types/:sector', authMiddleware, async (req, res) => {
  const { sector } = req.params;

  const providerMap = {
    ecommerce: [
      { type: 'shopify', name: 'Shopify Store' },
      { type: 'woocommerce', name: 'WooCommerce' },
      { type: 'magento', name: 'Magento' }
    ],
    healthcare: [
      { type: 'emr_epic', name: 'Epic EMR' },
      { type: 'emr_cerner', name: 'Cerner EMR' },
      { type: 'emr_meditech', name: 'Meditech EMR' }
    ],
    realestate: [
      { type: 'mls_nar', name: 'MLS (NAR)' },
      { type: 'zillow', name: 'Zillow' }
    ],
    fintech: [
      { type: 'stripe', name: 'Stripe' },
      { type: 'razorpay', name: 'RazorPay' }
    ]
    // Add more as needed
  };

  const providers = providerMap[sector] || [];
  return res.json({ success: true, sector, providers });
});

module.exports = router;
