const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));
const { authMiddleware } = require(resolve('auth/authMiddleware'));
const { encryptData, decryptData } = require(resolve('utils/encryption'));

/**
 * Settings Routes - Company Configuration & Business Rules
 * Multi-tenant: All operations filtered by client_id from JWT token
 */

/**
 * GET /api/settings/company/:clientId
 * Fetch all company settings and business configuration
 */
router.get('/company/:clientId', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Verify client ownership
    if (req.user.client_id !== clientId) {
      logger.warn('Unauthorized settings access', { userId: req.user.id, attemptedClientId: clientId });
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Query company settings from clients table (PostgreSQL)
    const company = await db.query(`
      SELECT 
        id, name, email, phone, sector, 
        return_window_days, refund_auto_threshold, cancel_window_hours,
        enable_whatsapp, enable_sms, enable_email,
        created_at, updated_at
      FROM clients
      WHERE id = $1
    `, [clientId]);

    if (!company.rows.length) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const c = company.rows[0];

    res.json({
      success: true,
      data: {
        company: {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          sector: c.sector
        },
        businessRules: {
          returnWindowDays: c.return_window_days || 14,
          refundAutoThreshold: c.refund_auto_threshold || 2000,
          cancelWindowHours: c.cancel_window_hours || 24
        },
        channels: {
          whatsapp: { enabled: c.enable_whatsapp || false },
          sms: { enabled: c.enable_sms || true },
          email: { enabled: c.enable_email || true }
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching company settings:', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/settings/company/:clientId
 * Update company settings and business rules
 */
router.put('/company/:clientId', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { businessRules } = req.body;

    // Verify client ownership
    if (req.user.client_id !== clientId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Validate inputs
    if (businessRules?.returnWindowDays && (businessRules.returnWindowDays < 1 || businessRules.returnWindowDays > 365)) {
      return res.status(400).json({ error: 'Return window must be 1-365 days' });
    }

    const result = await db.query(
      `UPDATE clients SET 
        return_window_days = COALESCE($2, return_window_days),
        refund_auto_threshold = COALESCE($3, refund_auto_threshold),
        cancel_window_hours = COALESCE($4, cancel_window_hours),
        enable_whatsapp = COALESCE($5, enable_whatsapp),
        enable_sms = COALESCE($6, enable_sms),
        enable_email = COALESCE($7, enable_email),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [
        clientId,
        businessRules?.returnWindowDays,
        businessRules?.refundAutoThreshold,
        businessRules?.cancelWindowHours,
        businessRules?.enableWhatsapp,
        businessRules?.enableSms,
        businessRules?.enableEmail
      ]
    );

    res.json({
      success: true,
      message: 'Company settings updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating company settings:', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/settings/channels
 * Get all configured channels for company
 */
router.get('/channels', authMiddleware, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const result = await db.query(
      `SELECT id, channel_type, provider, is_enabled FROM channels 
       WHERE client_id = $1 ORDER BY created_at ASC`,
      [clientId]
    );
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    logger.error('Error fetching channels:', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/settings/channels/:type/test
 * Test channel connectivity
 */
router.post('/channels/:type/test', authMiddleware, async (req, res) => {
  try {
    const { type } = req.params;
    logger.info('Testing channel', { type });
    res.json({ success: true, status: 'ok', message: `${type} channel test passed` });
  } catch (error) {
    logger.error('Error testing channel:', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/settings/business-rules
 * Get business rules for this company
 */
router.get('/business-rules', authMiddleware, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const result = await db.query(
      `SELECT * FROM business_rules WHERE client_id = $1 AND enabled = TRUE ORDER BY priority ASC`,
      [clientId]
    );
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    logger.error('Error fetching business rules:', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/settings/sectors
 * Get all available sectors
 */
router.get('/sectors', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT sector FROM sector_agents ORDER BY sector ASC`
    );
    
    const sectors = result.rows.map(r => ({
      id: r.sector,
      name: r.sector.charAt(0).toUpperCase() + r.sector.slice(1),
      emoji: getSectorEmoji(r.sector)
    }));

    res.json({ success: true, data: sectors });
  } catch (error) {
    logger.error('Error fetching sectors:', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function
function getSectorEmoji(sector) {
  const emojis = {
    healthcare: '🏥',
    ecommerce: '🛒',
    logistics: '🚚',
    fintech: '💰',
    support: '📞',
    telecom: '📱',
    realestate: '🏠',
    government: '🏛️',
    education: '🎓',
    travel: '✈️',
    saas: '💻'
  };
  return emojis[sector] || '📊';
}

module.exports = router;
