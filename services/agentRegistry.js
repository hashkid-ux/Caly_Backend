/**
 * Backend: Agent Registry Service
 * Manages agent metadata, capabilities, and client assignments
 * 
 * Real implementation - NOT hardcoded!
 */

const db = require('../../db/postgres');
const logger = require('../../utils/logger');
const resolve = require('../../utils/moduleResolver');

class AgentRegistry {
  /**
   * Get all available agents with their metadata
   */
  async getAllAgents() {
    try {
      const query = `
        SELECT 
          id,
          name,
          description,
          sector,
          capabilities,
          language_support,
          enabled,
          success_rate,
          avg_handling_time,
          icon,
          version
        FROM agents_registry
        ORDER BY sector, name
      `;

      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching all agents', { error: error.message });
      throw error;
    }
  }

  /**
   * Get agents for a specific sector
   */
  async getAgentsBySector(sector) {
    try {
      const query = `
        SELECT 
          id,
          name,
          description,
          sector,
          capabilities,
          language_support,
          enabled,
          success_rate,
          avg_handling_time,
          icon,
          version
        FROM agents_registry
        WHERE sector = $1 AND enabled = true
        ORDER BY success_rate DESC, name
      `;

      const result = await db.query(query, [sector]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching agents by sector', { sector, error: error.message });
      throw error;
    }
  }

  /**
   * Get agents assigned to a specific client
   */
  async getClientAgents(clientId) {
    try {
      const query = `
        SELECT 
          ar.id,
          ar.name,
          ar.description,
          ar.sector,
          ar.capabilities,
          ar.language_support,
          ar.enabled,
          ar.success_rate,
          ar.avg_handling_time,
          ar.icon,
          ar.version,
          aa.is_enabled,
          aa.custom_config,
          aa.assigned_at
        FROM agents_registry ar
        LEFT JOIN agent_assignments aa ON ar.id = aa.agent_id AND aa.client_id = $1
        ORDER BY ar.sector, ar.name
      `;

      const result = await db.query(query, [clientId]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching client agents', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Get enabled agents for a client
   */
  async getEnabledAgentsForClient(clientId) {
    try {
      const query = `
        SELECT 
          ar.id,
          ar.name,
          ar.description,
          ar.sector,
          ar.capabilities,
          ar.language_support,
          ar.icon,
          aa.custom_config,
          aa.assigned_at
        FROM agents_registry ar
        INNER JOIN agent_assignments aa ON ar.id = aa.agent_id
        WHERE aa.client_id = $1 AND aa.is_enabled = true AND ar.enabled = true
        ORDER BY ar.sector, ar.name
      `;

      const result = await db.query(query, [clientId]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching enabled agents for client', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Get agents assigned to a specific team member
   */
  async getTeamMemberAgents(teamMemberId) {
    try {
      const query = `
        SELECT 
          ar.id,
          ar.name,
          ar.description,
          ar.sector,
          ar.capabilities,
          tmaa.proficiency_level,
          tmaa.assigned_at
        FROM agents_registry ar
        INNER JOIN team_member_agent_assignments tmaa ON ar.id = tmaa.agent_id
        WHERE tmaa.team_member_id = $1
        ORDER BY ar.sector, tmaa.proficiency_level DESC, ar.name
      `;

      const result = await db.query(query, [teamMemberId]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching team member agents', { teamMemberId, error: error.message });
      throw error;
    }
  }

  /**
   * Enable an agent for a client
   */
  async enableAgentForClient(clientId, agentId, customConfig = null) {
    try {
      const query = `
        INSERT INTO agent_assignments (client_id, agent_id, is_enabled, custom_config, assigned_at)
        VALUES ($1, $2, true, $3, NOW())
        ON CONFLICT (client_id, agent_id)
        DO UPDATE SET is_enabled = true, custom_config = COALESCE(EXCLUDED.custom_config, custom_config)
        RETURNING *
      `;

      const result = await db.query(query, [clientId, agentId, customConfig ? JSON.stringify(customConfig) : null]);

      // Audit log
      await this.logAudit(clientId, 'agent_enabled', agentId, { custom_config: customConfig });

      logger.info('Agent enabled for client', { clientId, agentId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error enabling agent for client', { clientId, agentId, error: error.message });
      throw error;
    }
  }

  /**
   * Disable an agent for a client
   */
  async disableAgentForClient(clientId, agentId) {
    try {
      const query = `
        UPDATE agent_assignments
        SET is_enabled = false
        WHERE client_id = $1 AND agent_id = $2
        RETURNING *
      `;

      const result = await db.query(query, [clientId, agentId]);

      // Audit log
      await this.logAudit(clientId, 'agent_disabled', agentId, {});

      logger.info('Agent disabled for client', { clientId, agentId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error disabling agent for client', { clientId, agentId, error: error.message });
      throw error;
    }
  }

  /**
   * Get agent details
   */
  async getAgentDetails(agentId) {
    try {
      const query = `
        SELECT 
          id,
          name,
          description,
          sector,
          capabilities,
          language_support,
          enabled,
          success_rate,
          avg_handling_time,
          icon,
          version,
          configuration
        FROM agents_registry
        WHERE id = $1
      `;

      const result = await db.query(query, [agentId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching agent details', { agentId, error: error.message });
      throw error;
    }
  }

  /**
   * Update agent custom configuration for a client
   */
  async updateAgentConfig(clientId, agentId, customConfig) {
    try {
      const query = `
        UPDATE agent_assignments
        SET custom_config = $1
        WHERE client_id = $2 AND agent_id = $3
        RETURNING *
      `;

      const result = await db.query(query, [JSON.stringify(customConfig), clientId, agentId]);

      // Audit log
      await this.logAudit(clientId, 'agent_config_updated', agentId, { new_config: customConfig });

      logger.info('Agent config updated', { clientId, agentId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating agent config', { clientId, agentId, error: error.message });
      throw error;
    }
  }

  /**
   * Get all sectors with their agents
   */
  async getSectorsList() {
    try {
      const query = `
        SELECT DISTINCT sector FROM agents_registry WHERE enabled = true ORDER BY sector
      `;

      const result = await db.query(query);
      return result.rows.map(r => r.sector);
    } catch (error) {
      logger.error('Error fetching sectors list', { error: error.message });
      throw error;
    }
  }

  /**
   * Get agent statistics
   */
  async getAgentStats(agentId) {
    try {
      const query = `
        SELECT 
          ar.id,
          ar.name,
          ar.sector,
          ar.success_rate,
          ar.avg_handling_time,
          COUNT(DISTINCT CASE WHEN resolved = true THEN 1 END) as total_resolved_calls,
          COUNT(*) as total_calls,
          AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_call_duration
        FROM agents_registry ar
        LEFT JOIN calls c ON c.agent_type = ar.name
        WHERE ar.id = $1
        GROUP BY ar.id, ar.name, ar.sector, ar.success_rate, ar.avg_handling_time
      `;

      const result = await db.query(query, [agentId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching agent stats', { agentId, error: error.message });
      throw error;
    }
  }

  /**
   * Log audit trail for agent changes
   */
  async logAudit(clientId, action, agentId, metadata = {}) {
    try {
      const query = `
        INSERT INTO audit_log (client_id, action, affected_resource, metadata, timestamp)
        VALUES ($1, $2, $3, $4, NOW())
      `;

      await db.query(query, [
        clientId,
        action,
        `agent:${agentId}`,
        JSON.stringify(metadata)
      ]);
    } catch (error) {
      logger.warn('Failed to log audit', { error: error.message });
      // Don't throw - audit logging shouldn't break the main operation
    }
  }

  /**
   * Search agents by capability
   */
  async searchAgentsByCapability(capability, sector = null) {
    try {
      let query = `
        SELECT * FROM agents_registry
        WHERE capabilities @> $1 AND enabled = true
      `;
      const params = [`"${capability}"`];

      if (sector) {
        query += ` AND sector = $2`;
        params.push(sector);
      }

      query += ` ORDER BY sector, success_rate DESC`;

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error searching agents by capability', { capability, sector, error: error.message });
      throw error;
    }
  }

  /**
   * Register a new agent in the system
   * (For admin use)
   */
  async registerAgent(agentData) {
    try {
      const query = `
        INSERT INTO agents_registry (
          name,
          description,
          sector,
          capabilities,
          language_support,
          enabled,
          icon,
          version,
          configuration
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const result = await db.query(query, [
        agentData.name,
        agentData.description,
        agentData.sector,
        JSON.stringify(agentData.capabilities),
        JSON.stringify(agentData.language_support),
        agentData.enabled || false,
        agentData.icon,
        agentData.version || '1.0.0',
        JSON.stringify(agentData.configuration || {})
      ]);

      logger.info('Agent registered', { agent: agentData.name, sector: agentData.sector });
      return result.rows[0];
    } catch (error) {
      logger.error('Error registering agent', { agentData, error: error.message });
      throw error;
    }
  }
}

module.exports = new AgentRegistry();
