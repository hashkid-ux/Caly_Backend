const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth/authMiddleware');
const db = require('../db/postgres');

/**
 * Settings Routes - Company Configuration & Business Rules
 * ALL defaults come from backend, frontend ONLY displays
 */

/**
 * GET /api/settings/company/{clientId}
 * Fetch all company settings and business configuration
 */
router.get('/company/:clientId', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Verify client ownership
    if (req.user.client_id !== clientId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Query company settings from clients table
    const company = await db.query(`
      SELECT 
        id,
        name,
        email,
        phone,
        sector,
        return_window_days,
        refund_auto_threshold,
        cancel_window_hours,
        escalation_threshold,
        enable_whatsapp,
        enable_sms,
        enable_email,
        timezone,
        language,
        currency,
        settings,
        created_at,
        updated_at
      FROM clients
      WHERE id = ?
    `, [clientId]);

    if (company.length === 0) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const c = company[0];

    // Parse settings JSONB
    const settings = typeof c.settings === 'string' ? JSON.parse(c.settings) : c.settings || {};

    res.json({
      success: true,
      data: {
        company: {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          sector: c.sector,
          createdAt: c.created_at
        },

        businessRules: {
          returnWindowDays: c.return_window_days || 14,
          refundAutoThreshold: c.refund_auto_threshold || 2000,
          cancelWindowHours: c.cancel_window_hours || 24,
          escalationThreshold: c.escalation_threshold || 60
        },

        channels: {
          whatsapp: {
            enabled: c.enable_whatsapp || false,
            phoneNumber: settings.whatsapp?.phoneNumber || '',
            webhookUrl: settings.whatsapp?.webhookUrl || ''
          },
          sms: {
            enabled: c.enable_sms || true,
            senderId: settings.sms?.senderId || 'ACME',
            apiKey: settings.sms?.apiKey ? '***HIDDEN***' : ''
          },
          email: {
            enabled: c.enable_email || true,
            fromAddress: settings.email?.fromAddress || 'noreply@company.com',
            smtpServer: settings.email?.smtpServer || 'smtp.sendgrid.net'
          }
        },

        integrations: {
          shopify: {
            enabled: !!settings.shopify?.store,
            store: settings.shopify?.store || '',
            status: settings.shopify?.store ? 'connected' : 'not-configured'
          },
          exotel: {
            enabled: !!settings.exotel?.sid,
            accountSid: settings.exotel?.sid ? '***HIDDEN***' : '',
            status: settings.exotel?.sid ? 'connected' : 'not-configured'
          }
        },

        localization: {
          timezone: c.timezone || 'UTC',
          language: c.language || 'en',
          currency: c.currency || 'USD'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching company settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/settings/company/{clientId}
 * Update company settings and business rules
 */
router.put('/company/:clientId', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { company, businessRules, channels, localization } = req.body;

    // Verify client ownership
    if (req.user.client_id !== clientId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (company?.name) {
      updates.push('name = ?');
      params.push(company.name);
    }
    if (company?.email) {
      updates.push('email = ?');
      params.push(company.email);
    }
    if (company?.phone) {
      updates.push('phone = ?');
      params.push(company.phone);
    }

    if (businessRules?.returnWindowDays !== undefined) {
      updates.push('return_window_days = ?');
      params.push(businessRules.returnWindowDays);
    }
    if (businessRules?.refundAutoThreshold !== undefined) {
      updates.push('refund_auto_threshold = ?');
      params.push(businessRules.refundAutoThreshold);
    }
    if (businessRules?.cancelWindowHours !== undefined) {
      updates.push('cancel_window_hours = ?');
      params.push(businessRules.cancelWindowHours);
    }
    if (businessRules?.escalationThreshold !== undefined) {
      updates.push('escalation_threshold = ?');
      params.push(businessRules.escalationThreshold);
    }

    if (channels?.whatsapp?.enabled !== undefined) {
      updates.push('enable_whatsapp = ?');
      params.push(channels.whatsapp.enabled);
    }
    if (channels?.sms?.enabled !== undefined) {
      updates.push('enable_sms = ?');
      params.push(channels.sms.enabled);
    }
    if (channels?.email?.enabled !== undefined) {
      updates.push('enable_email = ?');
      params.push(channels.email.enabled);
    }

    if (localization?.timezone) {
      updates.push('timezone = ?');
      params.push(localization.timezone);
    }
    if (localization?.language) {
      updates.push('language = ?');
      params.push(localization.language);
    }
    if (localization?.currency) {
      updates.push('currency = ?');
      params.push(localization.currency);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push('updated_at = NOW()');
    params.push(clientId);

    // Execute update
    await db.query(
      `UPDATE clients SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({
      success: true,
      message: 'Company settings updated successfully',
      data: { clientId }
    });
  } catch (error) {
    console.error('Error updating company settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/settings/business-rules/{clientId}
 * Get all business rules for this company
 */
router.get('/business-rules/:clientId', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.params;

    if (req.user.client_id !== clientId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Get sector-specific rules
    const rules = await db.query(`
      SELECT 
        id,
        sector,
        config
      FROM sector_configurations
      WHERE client_id = ?
      ORDER BY sector
    `, [clientId]);

    // Get company-level business rules
    const company = await db.query(`
      SELECT 
        return_window_days,
        refund_auto_threshold,
        cancel_window_hours,
        escalation_threshold
      FROM clients
      WHERE id = ?
    `, [clientId]);

    res.json({
      success: true,
      data: {
        global: {
          returnWindowDays: company[0]?.return_window_days || 14,
          refundAutoThreshold: company[0]?.refund_auto_threshold || 2000,
          cancelWindowHours: company[0]?.cancel_window_hours || 24,
          escalationThreshold: company[0]?.escalation_threshold || 60
        },
        sectorOverrides: rules.map(r => ({
          sector: r.sector,
          config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching business rules:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/settings/sectors/{clientId}
 * Get all available sectors and their status for this company
 */
router.get('/sectors/:clientId', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.params;

    if (req.user.client_id !== clientId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Get company's primary sector
    const company = await db.query(`
      SELECT sector FROM clients WHERE id = ?
    `, [clientId]);

    // Get all available sectors with agent count
    const sectors = await db.query(`
      SELECT 
        DISTINCT sector,
        COUNT(DISTINCT agent_type) as agent_count
      FROM sector_agents
      GROUP BY sector
      ORDER BY sector
    `);

    res.json({
      success: true,
      data: {
        primarySector: company[0]?.sector || 'ecommerce',
        availableSectors: sectors.map(s => ({
          id: s.sector,
          name: s.sector.charAt(0).toUpperCase() + s.sector.slice(1),
          agentCount: s.agent_count,
          emoji: getSectorEmoji(s.sector)
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching sectors:', error);
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
