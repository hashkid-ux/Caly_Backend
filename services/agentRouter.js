/**
 * Agent Router - Intelligent routing of calls to available agents
 * Features: Load balancing, availability checking, team-based routing
 * Integrates with team performance metrics for optimal assignment
 */

const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));

class AgentRouter {
  constructor() {
    this.agents = new Map(); // { clientId: { sectorKey: [agents] } }
    this.loadTimestamp = 0;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize router - load agents from database
   */
  async initialize() {
    try {
      await this.loadAgents();
      logger.info('AgentRouter initialized');
    } catch (error) {
      logger.error('Failed to initialize AgentRouter', { error: error.message });
      throw error;
    }
  }

  /**
   * Load all agents from database, organized by sector
   */
  async loadAgents() {
    try {
      const result = await db.query(
        `SELECT * FROM sector_agents 
         WHERE is_available = true 
         ORDER BY sector, agent_type`
      );

      // Clear existing cache
      this.agents.clear();

      // Organize agents by client and sector
      result.rows.forEach(agent => {
        const clientKey = agent.client_id || 'default';
        
        if (!this.agents.has(clientKey)) {
          this.agents.set(clientKey, {});
        }

        const clientAgents = this.agents.get(clientKey);
        const sectorKey = `${agent.sector}`;

        if (!clientAgents[sectorKey]) {
          clientAgents[sectorKey] = [];
        }

        clientAgents[sectorKey].push({
          id: agent.id,
          type: agent.agent_type,
          sector: agent.sector,
          capabilities: agent.capabilities || {},
          priority: agent.priority || 0,
          success_rate: agent.success_rate || 0.8,
          avg_handling_time: agent.avg_handling_time || 300,
          current_load: 0 // Will be updated in real-time
        });
      });

      this.loadTimestamp = Date.now();
      logger.info('Agents loaded', { 
        clients: this.agents.size, 
        total: result.rows.length 
      });

    } catch (error) {
      logger.error('Error loading agents', { error: error.message });
      throw error;
    }
  }

  /**
   * Get best agent for a given call context
   * @param {string} clientId - Company ID
   * @param {string} sector - Industry sector
   * @param {string} callType - Type of call (inbound, outbound, etc)
   * @param {object} callContext - Additional call context
   */
  async selectAgent(clientId, sector, callType, callContext = {}) {
    try {
      // Refresh agents if cache expired
      if (Date.now() - this.loadTimestamp > this.CACHE_DURATION) {
        await this.loadAgents();
      }

      // Get team-based routing if available
      if (callContext.team_id) {
        return await this.selectTeamAgent(clientId, callContext.team_id, sector);
      }

      // Default sector-based routing
      return this.selectSectorAgent(clientId, sector, callContext);

    } catch (error) {
      logger.error('Error selecting agent', { error: error.message });
      // Return null if routing fails (fallback to basic routing)
      return null;
    }
  }

  /**
   * Select agent from team members
   */
  async selectTeamAgent(clientId, teamId, sector) {
    try {
      // Get team members sorted by performance and availability
      const result = await db.query(
        `SELECT tm.id as member_id, tm.performance_score, 
                COUNT(DISTINCT taa.id) as agent_count,
                COALESCE(AVG(tm2.calls_handled), 0) as avg_calls
         FROM team_members tm
         JOIN teams t ON tm.team_id = t.id
         LEFT JOIN team_agent_assignments taa ON tm.id = taa.team_member_id
         LEFT JOIN team_members tm2 ON tm2.team_id = t.id
         WHERE t.id = $1 AND t.client_id = $2 AND t.sector = $3
         GROUP BY tm.id, tm.performance_score
         ORDER BY tm.performance_score DESC, agent_count DESC
         LIMIT 1`,
        [teamId, clientId, sector]
      );

      if (result.rows.length === 0) {
        logger.warn('No team members available', { teamId, sector });
        return null;
      }

      const member = result.rows[0];
      
      // Get assigned agents for this member
      const agentsResult = await db.query(
        `SELECT * FROM team_agent_assignments 
         WHERE team_member_id = $1 
         ORDER BY proficiency_level DESC
         LIMIT 1`,
        [member.member_id]
      );

      if (agentsResult.rows.length === 0) {
        return null;
      }

      return {
        type: 'team',
        agent_id: agentsResult.rows[0].id,
        team_member_id: member.member_id,
        agent_type: agentsResult.rows[0].agent_type,
        proficiency: agentsResult.rows[0].proficiency_level,
        performance_score: member.performance_score
      };

    } catch (error) {
      logger.error('Error selecting team agent', { error: error.message });
      return null;
    }
  }

  /**
   * Select agent by sector using load balancing
   */
  selectSectorAgent(clientId, sector, callContext = {}) {
    const clientKey = clientId || 'default';

    if (!this.agents.has(clientKey)) {
      logger.warn('No agents configured for client', { clientId });
      return null;
    }

    const clientAgents = this.agents.get(clientKey);
    const sectorKey = sector;

    if (!clientAgents[sectorKey] || clientAgents[sectorKey].length === 0) {
      logger.warn('No agents available for sector', { clientId, sector });
      // Fallback to any available agent
      return this.selectFallbackAgent(clientKey);
    }

    const agents = clientAgents[sectorKey];

    // Score agents by: success_rate, priority, load, handling_time
    const scoredAgents = agents.map(agent => ({
      ...agent,
      score: this.calculateAgentScore(agent, callContext)
    }));

    // Sort by score (highest first)
    scoredAgents.sort((a, b) => b.score - a.score);

    const selectedAgent = scoredAgents[0];

    return {
      type: 'sector',
      agent_id: selectedAgent.id,
      agent_type: selectedAgent.type,
      sector: selectedAgent.sector,
      score: selectedAgent.score
    };
  }

  /**
   * Calculate routing score for an agent
   * Considers: success rate, priority, current load, handling time
   */
  calculateAgentScore(agent, callContext = {}) {
    let score = 0;

    // 40% - Success rate (most important)
    score += agent.success_rate * 40;

    // 25% - Priority (configuration importance)
    score += Math.min(agent.priority, 10) * 2.5;

    // 20% - Current load (inverse - lower load is better)
    const loadPenalty = Math.min(agent.current_load * 2, 20);
    score += 20 - loadPenalty;

    // 15% - Handling time efficiency (inverse - faster is better)
    const timeEfficiency = Math.max(0, 15 - (agent.avg_handling_time / 60));
    score += Math.min(timeEfficiency, 15);

    // Bonus for capability match
    if (callContext.required_capabilities) {
      callContext.required_capabilities.forEach(cap => {
        if (agent.capabilities[cap]) {
          score += 5;
        }
      });
    }

    return score;
  }

  /**
   * Fallback agent selection - return any available agent
   */
  selectFallbackAgent(clientKey) {
    if (!this.agents.has(clientKey)) {
      return null;
    }

    const clientAgents = this.agents.get(clientKey);
    const allAgents = Object.values(clientAgents).flat();

    if (allAgents.length === 0) {
      return null;
    }

    // Return highest priority agent
    allAgents.sort((a, b) => b.priority - a.priority);

    const agent = allAgents[0];
    return {
      type: 'fallback',
      agent_id: agent.id,
      agent_type: agent.type,
      sector: agent.sector
    };
  }

  /**
   * Update agent load after assignment
   */
  updateAgentLoad(clientId, agentId, increment = 1) {
    const clientKey = clientId || 'default';

    if (!this.agents.has(clientKey)) {
      return;
    }

    const clientAgents = this.agents.get(clientKey);
    const allAgents = Object.values(clientAgents).flat();

    const agent = allAgents.find(a => a.id === agentId);
    if (agent) {
      agent.current_load = Math.max(0, agent.current_load + increment);
    }
  }

  /**
   * Log agent selection for analytics
   */
  async logSelection(clientId, callId, selectedAgent, callContext = {}) {
    try {
      await db.query(
        `INSERT INTO agent_routing_log (client_id, call_id, agent_id, agent_type, routing_type, selected_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [clientId, callId, selectedAgent.agent_id, selectedAgent.agent_type, selectedAgent.type]
      );
    } catch (error) {
      logger.warn('Failed to log agent selection', { error: error.message });
    }
  }

  /**
   * Get agent statistics for a sector
   */
  async getSectorStats(clientId, sector) {
    try {
      const result = await db.query(
        `SELECT 
          agent_type,
          COUNT(*) as count,
          ROUND(AVG(success_rate)::numeric, 2) as avg_success_rate,
          ROUND(AVG(avg_handling_time)::numeric, 2) as avg_handling_time
         FROM sector_agents
         WHERE client_id = $1 AND sector = $2 AND is_available = true
         GROUP BY agent_type`,
        [clientId, sector]
      );

      return result.rows || [];

    } catch (error) {
      logger.error('Error getting sector stats', { error: error.message });
      return [];
    }
  }

  /**
   * Health check - verify agents are still available
   */
  async healthCheck() {
    try {
      const result = await db.query(
        `SELECT COUNT(*) as total, 
                SUM(CASE WHEN is_available = true THEN 1 ELSE 0 END) as available
         FROM sector_agents`
      );

      const stats = result.rows[0];
      const availability = stats.total > 0 ? (stats.available / stats.total * 100) : 0;

      return {
        healthy: availability >= 80, // At least 80% available
        total_agents: parseInt(stats.total),
        available_agents: parseInt(stats.available),
        availability_percent: Math.round(availability)
      };

    } catch (error) {
      logger.error('Error checking router health', { error: error.message });
      return { healthy: false, error: error.message };
    }
  }
}

// Export singleton
module.exports = new AgentRouter();
