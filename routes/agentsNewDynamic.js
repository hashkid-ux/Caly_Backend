/**
 * Backend: Agent Management Routes
 * Dynamic agent enable/disable and configuration
 */

const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const { authMiddleware } = require(resolve('auth/authMiddleware'));
const logger = require(resolve('utils/logger'));
const agentRegistry = require(resolve('services/agentRegistry'));
const apiResponse = require(resolve('utils/apiResponse'));

/**
 * GET /api/agents
 * Get all available agents (admin view)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const agents = await agentRegistry.getAllAgents();
    res.json(apiResponse.success(agents, 'Agents fetched successfully'));
  } catch (error) {
    logger.error('Error fetching agents', { error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch agents', 500));
  }
});

/**
 * GET /api/agents/sector/:sector
 * Get agents for a specific sector
 */
router.get('/sector/:sector', authMiddleware, async (req, res) => {
  try {
    const { sector } = req.params;
    const agents = await agentRegistry.getAgentsBySector(sector);
    res.json(apiResponse.success(agents, `Agents for ${sector} sector`));
  } catch (error) {
    logger.error('Error fetching sector agents', { sector: req.params.sector, error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch sector agents', 500));
  }
});

/**
 * GET /api/agents/client/enabled
 * Get agents enabled for the current client
 */
router.get('/client/enabled', authMiddleware, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const agents = await agentRegistry.getEnabledAgentsForClient(clientId);
    res.json(apiResponse.success(agents, 'Client enabled agents'));
  } catch (error) {
    logger.error('Error fetching client enabled agents', { clientId: req.user.client_id, error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch enabled agents', 500));
  }
});

/**
 * GET /api/agents/client/all
 * Get all agents with client assignment status
 */
router.get('/client/all', authMiddleware, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const agents = await agentRegistry.getClientAgents(clientId);
    res.json(apiResponse.success(agents, 'Client agents with assignment status'));
  } catch (error) {
    logger.error('Error fetching client agents', { clientId: req.user.client_id, error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch client agents', 500));
  }
});

/**
 * GET /api/agents/:agentId
 * Get specific agent details
 */
router.get('/:agentId', authMiddleware, async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await agentRegistry.getAgentDetails(agentId);

    if (!agent) {
      return res.status(404).json(apiResponse.error('Agent not found', 404));
    }

    // Get client-specific config if exists
    const agents = await agentRegistry.getClientAgents(req.user.client_id);
    const clientConfig = agents.find(a => a.id === agentId);

    const response = {
      ...agent,
      client_config: clientConfig?.custom_config || null,
      is_enabled_for_client: clientConfig?.is_enabled || false
    };

    res.json(apiResponse.success(response, 'Agent details'));
  } catch (error) {
    logger.error('Error fetching agent details', { agentId: req.params.agentId, error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch agent details', 500));
  }
});

/**
 * POST /api/agents/:agentId/enable
 * Enable an agent for the client
 */
router.post('/:agentId/enable', authMiddleware, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { custom_config } = req.body;
    const clientId = req.user.client_id;

    // Verify agent exists
    const agent = await agentRegistry.getAgentDetails(agentId);
    if (!agent) {
      return res.status(404).json(apiResponse.error('Agent not found', 404));
    }

    const result = await agentRegistry.enableAgentForClient(clientId, agentId, custom_config);

    logger.info('Agent enabled for client', { clientId, agentId });
    res.json(apiResponse.success(result, `${agent.name} enabled successfully`));
  } catch (error) {
    logger.error('Error enabling agent', { agentId: req.params.agentId, error: error.message });
    res.status(500).json(apiResponse.error('Failed to enable agent', 500));
  }
});

/**
 * POST /api/agents/:agentId/disable
 * Disable an agent for the client
 */
router.post('/:agentId/disable', authMiddleware, async (req, res) => {
  try {
    const { agentId } = req.params;
    const clientId = req.user.client_id;

    // Verify agent exists
    const agent = await agentRegistry.getAgentDetails(agentId);
    if (!agent) {
      return res.status(404).json(apiResponse.error('Agent not found', 404));
    }

    const result = await agentRegistry.disableAgentForClient(clientId, agentId);

    logger.info('Agent disabled for client', { clientId, agentId });
    res.json(apiResponse.success(result, `${agent.name} disabled successfully`));
  } catch (error) {
    logger.error('Error disabling agent', { agentId: req.params.agentId, error: error.message });
    res.status(500).json(apiResponse.error('Failed to disable agent', 500));
  }
});

/**
 * PUT /api/agents/:agentId/config
 * Update agent configuration for the client
 */
router.put('/:agentId/config', authMiddleware, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { config } = req.body;
    const clientId = req.user.client_id;

    // Verify agent exists
    const agent = await agentRegistry.getAgentDetails(agentId);
    if (!agent) {
      return res.status(404).json(apiResponse.error('Agent not found', 404));
    }

    if (!config || typeof config !== 'object') {
      return res.status(400).json(apiResponse.error('Config must be an object', 400));
    }

    const result = await agentRegistry.updateAgentConfig(clientId, agentId, config);

    logger.info('Agent config updated', { clientId, agentId });
    res.json(apiResponse.success(result, `${agent.name} configuration updated`));
  } catch (error) {
    logger.error('Error updating agent config', { agentId: req.params.agentId, error: error.message });
    res.status(500).json(apiResponse.error('Failed to update agent config', 500));
  }
});

/**
 * GET /api/agents/:agentId/stats
 * Get agent statistics
 */
router.get('/:agentId/stats', authMiddleware, async (req, res) => {
  try {
    const { agentId } = req.params;
    const stats = await agentRegistry.getAgentStats(agentId);

    if (!stats) {
      return res.status(404).json(apiResponse.error('Agent not found', 404));
    }

    res.json(apiResponse.success(stats, 'Agent statistics'));
  } catch (error) {
    logger.error('Error fetching agent stats', { agentId: req.params.agentId, error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch agent statistics', 500));
  }
});

/**
 * GET /api/agents/search/capability
 * Search agents by capability
 */
router.get('/search/capability', authMiddleware, async (req, res) => {
  try {
    const { capability, sector } = req.query;

    if (!capability) {
      return res.status(400).json(apiResponse.error('Capability parameter required', 400));
    }

    const agents = await agentRegistry.searchAgentsByCapability(capability, sector);
    res.json(apiResponse.success(agents, `Agents with ${capability} capability`));
  } catch (error) {
    logger.error('Error searching agents', { error: error.message });
    res.status(500).json(apiResponse.error('Failed to search agents', 500));
  }
});

/**
 * GET /api/agents/sectors/list
 * Get list of all sectors with agents
 */
router.get('/sectors/list', authMiddleware, async (req, res) => {
  try {
    const sectors = await agentRegistry.getSectorsList();
    res.json(apiResponse.success(sectors, 'Sectors list'));
  } catch (error) {
    logger.error('Error fetching sectors list', { error: error.message });
    res.status(500).json(apiResponse.error('Failed to fetch sectors list', 500));
  }
});

module.exports = router;
