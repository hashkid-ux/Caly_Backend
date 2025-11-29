// Backend/routes/sectorConfig.js
// ✅ PHASE 3: Sector configuration API endpoints

const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));
const db = require(resolve('db/postgres'));

// Middleware to verify client ownership of sector
async function verifySectorAccess(req, res, next) {
  try {
    const { sectorId } = req.params;
    const clientId = req.user?.client_id;

    if (!clientId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if client has this sector
    const result = await db.query(
      'SELECT * FROM sector_configurations WHERE client_id = $1 AND sector = $2',
      [clientId, sectorId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this sector' });
    }

    req.sectorConfig = result.rows[0];
    next();
  } catch (error) {
    logger.error('[SectorConfig] Verification error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/sector/config/:sectorId
 * Fetch sector configuration for a specific sector
 */
router.get('/config/:sectorId', verifySectorAccess, async (req, res) => {
  try {
    const { sectorId } = req.params;
    const clientId = req.user?.client_id;

    logger.info('📋 [SectorConfig] Fetching configuration', { 
      clientId, 
      sectorId 
    });

    const result = await db.query(
      `SELECT 
        sector, 
        config, 
        enabled,
        created_at, 
        updated_at 
       FROM sector_configurations 
       WHERE client_id = $1 AND sector = $2`,
      [clientId, sectorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sector configuration not found' });
    }

    const config = result.rows[0];
    
    logger.info('✅ [SectorConfig] Configuration retrieved', { 
      sectorId,
      enabled: config.enabled
    });

    res.json({
      sector: config.sector,
      config: config.config,
      enabled: config.enabled,
      updated_at: config.updated_at
    });
  } catch (error) {
    logger.error('❌ [SectorConfig] Get config error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

/**
 * PUT /api/sector/config/:sectorId
 * Update sector configuration
 */
router.put('/config/:sectorId', verifySectorAccess, async (req, res) => {
  try {
    const { sectorId } = req.params;
    const clientId = req.user?.client_id;
    const { config, enabled } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Invalid configuration object' });
    }

    logger.info('✏️ [SectorConfig] Updating configuration', { 
      clientId, 
      sectorId,
      fields: Object.keys(config)
    });

    // Validate configuration based on sector
    const validationResult = validateSectorConfig(sectorId, config);
    if (!validationResult.valid) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.errors 
      });
    }

    // Update configuration
    const result = await db.query(
      `UPDATE sector_configurations 
       SET config = $1, enabled = $2, updated_at = NOW()
       WHERE client_id = $3 AND sector = $4
       RETURNING *`,
      [JSON.stringify(config), enabled !== false, clientId, sectorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sector configuration not found' });
    }

    logger.info('✅ [SectorConfig] Configuration updated', { 
      sectorId,
      enabled
    });

    res.json({
      sector: result.rows[0].sector,
      config: result.rows[0].config,
      enabled: result.rows[0].enabled,
      updated_at: result.rows[0].updated_at
    });
  } catch (error) {
    logger.error('❌ [SectorConfig] Update config error', { error: error.message });
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

/**
 * GET /api/sectors
 * List all available sectors for a client
 */
router.get('/', async (req, res) => {
  try {
    const clientId = req.user?.client_id;

    if (!clientId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info('📊 [SectorConfig] Listing sectors', { clientId });

    const result = await db.query(
      `SELECT sector, enabled, config, updated_at 
       FROM sector_configurations 
       WHERE client_id = $1
       ORDER BY sector ASC`,
      [clientId]
    );

    const sectors = result.rows.map(row => ({
      id: row.sector,
      name: formatSectorName(row.sector),
      enabled: row.enabled,
      lastUpdated: row.updated_at
    }));

    logger.info('✅ [SectorConfig] Sectors listed', { 
      clientId,
      count: sectors.length
    });

    res.json({ sectors });
  } catch (error) {
    logger.error('❌ [SectorConfig] List sectors error', { error: error.message });
    res.status(500).json({ error: 'Failed to list sectors' });
  }
});

/**
 * GET /api/sector/:sectorId/agents
 * List available agents for a sector
 */
router.get('/:sectorId/agents', async (req, res) => {
  try {
    const { sectorId } = req.params;
    const clientId = req.user?.client_id;

    logger.info('🤖 [SectorConfig] Listing agents', { 
      clientId, 
      sectorId 
    });

    const result = await db.query(
      `SELECT 
        agent_id, 
        agent_type, 
        display_name,
        description,
        priority,
        enabled
       FROM sector_agents 
       WHERE sector = $1 AND enabled = true
       ORDER BY priority ASC`,
      [sectorId]
    );

    const agents = result.rows.map(row => ({
      id: row.agent_id,
      type: row.agent_type,
      name: row.display_name,
      description: row.description,
      priority: row.priority
    }));

    logger.info('✅ [SectorConfig] Agents listed', { 
      sectorId,
      count: agents.length
    });

    res.json({ sector: sectorId, agents });
  } catch (error) {
    logger.error('❌ [SectorConfig] List agents error', { error: error.message });
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * GET /api/sector/:sectorId/entities
 * Get entity types defined for a sector
 */
router.get('/:sectorId/entities', async (req, res) => {
  try {
    const { sectorId } = req.params;

    logger.info('📋 [SectorConfig] Fetching entities', { sectorId });

    const result = await db.query(
      `SELECT 
        entity_id,
        entity_type,
        display_name,
        description
       FROM sector_entities 
       WHERE sector = $1
       ORDER BY entity_type ASC`,
      [sectorId]
    );

    const entities = result.rows.map(row => ({
      id: row.entity_id,
      type: row.entity_type,
      name: row.display_name,
      description: row.description
    }));

    logger.info('✅ [SectorConfig] Entities fetched', { 
      sectorId,
      count: entities.length
    });

    res.json({ sector: sectorId, entities });
  } catch (error) {
    logger.error('❌ [SectorConfig] Fetch entities error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
});

/**
 * GET /api/sector/:sectorId/intent-patterns
 * Get intent patterns for a sector
 */
router.get('/:sectorId/intent-patterns', async (req, res) => {
  try {
    const { sectorId } = req.params;
    const language = req.query.language || 'english';

    logger.info('🎯 [SectorConfig] Fetching intent patterns', { 
      sectorId,
      language
    });

    const result = await db.query(
      `SELECT 
        pattern_id,
        intent_name,
        pattern,
        priority
       FROM sector_intent_patterns 
       WHERE sector = $1 AND language = $2
       ORDER BY priority ASC`,
      [sectorId, language]
    );

    const patterns = result.rows.map(row => ({
      id: row.pattern_id,
      intent: row.intent_name,
      pattern: row.pattern,
      priority: row.priority
    }));

    logger.info('✅ [SectorConfig] Intent patterns fetched', { 
      sectorId,
      language,
      count: patterns.length
    });

    res.json({ sector: sectorId, language, patterns });
  } catch (error) {
    logger.error('❌ [SectorConfig] Fetch patterns error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch intent patterns' });
  }
});

/**
 * POST /api/sector/:sectorId/enable
 * Enable a sector for a client
 */
router.post('/:sectorId/enable', async (req, res) => {
  try {
    const { sectorId } = req.params;
    const clientId = req.user?.client_id;

    logger.info('🔓 [SectorConfig] Enabling sector', { 
      clientId, 
      sectorId 
    });

    const result = await db.query(
      `UPDATE sector_configurations 
       SET enabled = true, updated_at = NOW()
       WHERE client_id = $1 AND sector = $2
       RETURNING *`,
      [clientId, sectorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sector configuration not found' });
    }

    logger.info('✅ [SectorConfig] Sector enabled', { sectorId });

    res.json({ 
      sector: result.rows[0].sector,
      enabled: true,
      message: 'Sector enabled successfully'
    });
  } catch (error) {
    logger.error('❌ [SectorConfig] Enable sector error', { error: error.message });
    res.status(500).json({ error: 'Failed to enable sector' });
  }
});

/**
 * POST /api/sector/:sectorId/disable
 * Disable a sector for a client
 */
router.post('/:sectorId/disable', async (req, res) => {
  try {
    const { sectorId } = req.params;
    const clientId = req.user?.client_id;

    logger.info('🔒 [SectorConfig] Disabling sector', { 
      clientId, 
      sectorId 
    });

    const result = await db.query(
      `UPDATE sector_configurations 
       SET enabled = false, updated_at = NOW()
       WHERE client_id = $1 AND sector = $2
       RETURNING *`,
      [clientId, sectorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sector configuration not found' });
    }

    logger.info('✅ [SectorConfig] Sector disabled', { sectorId });

    res.json({ 
      sector: result.rows[0].sector,
      enabled: false,
      message: 'Sector disabled successfully'
    });
  } catch (error) {
    logger.error('❌ [SectorConfig] Disable sector error', { error: error.message });
    res.status(500).json({ error: 'Failed to disable sector' });
  }
});

// ===== VALIDATION FUNCTIONS =====

function validateSectorConfig(sector, config) {
  const errors = [];

  // Sector-specific validation rules
  const validationRules = {
    ecommerce: {
      return_window_days: (v) => Number.isInteger(v) && v > 0,
      refund_threshold: (v) => typeof v === 'number' && v >= 0,
      cancel_window_hours: (v) => Number.isInteger(v) && v > 0
    },
    healthcare: {
      appointment_buffer_mins: (v) => Number.isInteger(v) && v > 0,
      escalation_wait_time: (v) => Number.isInteger(v) && v > 0,
      hipaa_enabled: (v) => typeof v === 'boolean'
    },
    realestate: {
      followup_window_hours: (v) => Number.isInteger(v) && v > 0,
      showing_duration_mins: (v) => Number.isInteger(v) && v > 0
    },
    logistics: {
      delivery_attempt_limit: (v) => Number.isInteger(v) && v > 0,
      address_clarification_threshold: (v) => typeof v === 'number' && v >= 0
    },
    fintech: {
      transaction_verification_timeout: (v) => Number.isInteger(v) && v > 0,
      fraud_alert_threshold: (v) => typeof v === 'number' && v >= 0
    }
  };

  const rules = validationRules[sector];
  if (!rules) {
    return { valid: true, errors: [] }; // No validation rules for this sector
  }

  for (const [field, validator] of Object.entries(rules)) {
    if (field in config && !validator(config[field])) {
      errors.push(`Invalid value for ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function formatSectorName(sectorId) {
  const names = {
    ecommerce: 'E-Commerce',
    healthcare: 'Healthcare',
    realestate: 'Real Estate',
    logistics: 'Logistics',
    fintech: 'FinTech',
    support: 'Support & SaaS',
    education: 'Education',
    hospitality: 'Hospitality',
    automotive: 'Automotive',
    manufacturing: 'Manufacturing',
    custom: 'Custom'
  };
  return names[sectorId] || sectorId;
}

module.exports = router;
