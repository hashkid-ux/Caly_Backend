// Backend/routes/clients.js - Client management for multi-tenancy
const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));
const { enforceClientAccess } = require(resolve('auth/authMiddleware'));
const { validateBody, commonSchemas } = require(resolve('middleware/validation')); // ✅ PHASE 2 FIX 4

// GET /api/clients/:id - Get single client (MULTI-TENANT: user can only access their own)
router.get('/:id', enforceClientAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const userClientId = req.user.client_id;

    // Verify user owns this client
    if (id !== userClientId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await db.query(
      `SELECT id, name as company_name, created_at, settings FROM clients WHERE id = $1`,
      [userClientId]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const client = result.rows[0];

    res.json({
      id: client.id,
      companyName: client.company_name,
      settings: client.settings || {},
      createdAt: client.created_at
    });

  } catch (error) {
    logger.error('Error fetching client', { error: error.message, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch company info' });
  }
});

// PUT /api/clients/:id - Update company configuration (MULTI-TENANT: user can only update their own)
router.put('/:id', enforceClientAccess, validateBody(commonSchemas.settingsUpdateSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const userClientId = req.user.client_id;

    // Verify user owns this client
    if (id !== userClientId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

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
      enableWhatsApp,
      enableSMS,
      enableEmail,
      timezone,
      language
    } = req.body;

    // Note: validateBody middleware already validated required fields and formats

    // Build settings object
    const settings = {
      shopify: {
        store: shopifyStore,
        apiKey: shopifyApiKey,
        apiSecret: shopifyApiSecret
      },
      exotel: {
        number: exotelNumber,
        sid: exotelSid,
        token: exotelToken
      },
      business: {
        returnWindowDays: parseInt(returnWindowDays) || 14,
        refundAutoThreshold: parseInt(refundAutoThreshold) || 2000,
        cancelWindowHours: parseInt(cancelWindowHours) || 24,
        escalationThreshold: parseInt(req.body.escalationThreshold) || 60
      },
      channels: {
        whatsApp: enableWhatsApp || false,
        sms: enableSMS !== false,
        email: enableEmail !== false
      },
      localization: {
        timezone: timezone || 'Asia/Kolkata',
        language: language || 'hi'
      }
    };

    // Update client settings
    const result = await db.query(
      `UPDATE clients 
       SET settings = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, name as company_name, settings`,
      [JSON.stringify(settings), userClientId]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const updatedClient = result.rows[0];

    logger.info('Client updated', { 
      clientId: userClientId, 
      userId: req.user.id 
    });

    res.json({
      id: updatedClient.id,
      companyName: updatedClient.company_name,
      settings: updatedClient.settings || {},
      message: 'Company configuration updated successfully'
    });

  } catch (error) {
    logger.error('Error updating client', { 
      error: error.message, 
      userId: req.user?.id,
      clientId: req.user?.client_id 
    });
    res.status(500).json({ error: 'Failed to update company info' });
  }
});

// GET /api/clients/:id/stats - Get company statistics (MULTI-TENANT)
router.get('/:id/stats', enforceClientAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const userClientId = req.user.client_id;

    if (id !== userClientId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get today's calls
    const todaysCallsResult = await db.query(
      `SELECT COUNT(*) as count, SUM(CAST(call_cost AS NUMERIC)) as revenue
       FROM calls 
       WHERE client_id = $1 AND DATE(start_ts) = CURRENT_DATE`,
      [userClientId]
    );

    // Get average duration
    const avgDurationResult = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (end_ts - start_ts))) as avg_seconds
       FROM calls 
       WHERE client_id = $1 AND start_ts >= $2 AND end_ts IS NOT NULL`,
      [userClientId, startDate]
    );

    // Get satisfaction rate
    const satisfactionResult = await db.query(
      `SELECT 
        COUNT(CASE WHEN feedback_score >= 4 THEN 1 END) * 100.0 / 
        NULLIF(COUNT(*), 0) as satisfaction_rate
       FROM calls 
       WHERE client_id = $1 AND feedback_score IS NOT NULL`,
      [userClientId]
    );

    const todaysCalls = parseInt(todaysCallsResult.rows[0]?.count || 0);
    const todaysRevenue = parseFloat(todaysCallsResult.rows[0]?.revenue || 0);
    const avgDuration = parseFloat(avgDurationResult.rows[0]?.avg_seconds || 0) / 60; // Convert to minutes
    const satisfactionRate = parseFloat(satisfactionResult.rows[0]?.satisfaction_rate || 0);

    res.json({
      todaysCalls,
      todaysRevenue: parseFloat(todaysRevenue.toFixed(2)),
      avgDuration: parseFloat(avgDuration.toFixed(2)),
      satisfactionRate: parseFloat(satisfactionRate.toFixed(2)),
      period: {
        days,
        startDate: startDate.toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching client stats', { 
      error: error.message, 
      userId: req.user?.id 
    });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/analytics/dashboard - Get dashboard data (MULTI-TENANT)
router.get('/analytics/dashboard', enforceClientAccess, async (req, res) => {
  try {
    const userClientId = req.user.client_id;

    // Today's stats
    const todayResult = await db.query(
      `SELECT 
        COUNT(*) as calls,
        SUM(CAST(call_cost AS NUMERIC)) as revenue,
        AVG(EXTRACT(EPOCH FROM (end_ts - start_ts))/60) as avg_duration
       FROM calls 
       WHERE client_id = $1 AND DATE(start_ts) = CURRENT_DATE AND end_ts IS NOT NULL`,
      [userClientId]
    );

    const today = todayResult.rows[0];

    // Yesterday for comparison
    const yesterdayResult = await db.query(
      `SELECT 
        COUNT(*) as calls,
        SUM(CAST(call_cost AS NUMERIC)) as revenue
       FROM calls 
       WHERE client_id = $1 AND DATE(start_ts) = CURRENT_DATE - INTERVAL '1 day'`,
      [userClientId]
    );

    const yesterday = yesterdayResult.rows[0];

    const todaysCalls = parseInt(today?.calls || 0);
    const yesterdaysCalls = parseInt(yesterday?.calls || 0);
    const callsChange = yesterdaysCalls > 0 
      ? (((todaysCalls - yesterdaysCalls) / yesterdaysCalls) * 100).toFixed(1)
      : 0;

    const todaysRevenue = parseFloat(today?.revenue || 0);
    const yesterdaysRevenue = parseFloat(yesterday?.revenue || 0);
    const revenueChange = yesterdaysRevenue > 0
      ? (((todaysRevenue - yesterdaysRevenue) / yesterdaysRevenue) * 100).toFixed(1)
      : 0;

    // Satisfaction
    const satisfactionResult = await db.query(
      `SELECT 
        ROUND(COUNT(CASE WHEN feedback_score >= 4 THEN 1 END) * 100.0 / 
        NULLIF(COUNT(*), 0), 2) as satisfaction_rate
       FROM calls 
       WHERE client_id = $1 AND feedback_score IS NOT NULL AND DATE(start_ts) = CURRENT_DATE`,
      [userClientId]
    );

    const satisfactionRate = parseFloat(satisfactionResult.rows[0]?.satisfaction_rate || 0);

    res.json({
      todaysCalls,
      callsChange,
      todaysRevenue: parseFloat(todaysRevenue.toFixed(2)),
      revenueChange,
      avgDuration: parseFloat((today?.avg_duration || 0).toFixed(2)),
      durationChange: 0,
      satisfactionRate,
      satisfactionChange: 0
    });

  } catch (error) {
    logger.error('Error fetching dashboard', { 
      error: error.message, 
      userId: req.user?.id 
    });
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;