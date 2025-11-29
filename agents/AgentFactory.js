/**
 * Agent Factory & Registry
 * Centralized agent management and instantiation
 * 
 * Manages 54+ agents across 11 sectors with:
 * - Dynamic agent loading
 * - Capability registration
 * - Performance tracking
 * - Fallback handling
 */

const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this.capabilities = new Map();
    this.sectorAgents = new Map();
    this.agentInstances = new Map();
  }

  /**
   * Register an agent class
   */
  registerAgent(agentType, AgentClass, metadata = {}) {
    this.agents.set(agentType, {
      class: AgentClass,
      metadata: {
        name: metadata.name || agentType,
        sector: metadata.sector || 'general',
        capabilities: metadata.capabilities || [],
        description: metadata.description || '',
        languages: metadata.languages || ['en'],
        priority: metadata.priority || 1,
        maxConcurrentCalls: metadata.maxConcurrentCalls || 10,
        trainingData: metadata.trainingData || [],
        ...metadata,
      },
    });

    // Index by sector
    const sector = metadata.sector || 'general';
    if (!this.sectorAgents.has(sector)) {
      this.sectorAgents.set(sector, []);
    }
    this.sectorAgents.get(sector).push(agentType);

    // Register capabilities
    (metadata.capabilities || []).forEach((capability) => {
      if (!this.capabilities.has(capability)) {
        this.capabilities.set(capability, []);
      }
      this.capabilities.get(capability).push(agentType);
    });

    logger.info(`✅ Agent registered: ${agentType} (${sector})`);
  }

  /**
   * Get or create agent instance
   */
  getInstance(agentType, options = {}) {
    const instanceKey = `${agentType}-${options.clientId || 'default'}`;

    if (!this.agentInstances.has(instanceKey)) {
      const agentDef = this.agents.get(agentType);
      if (!agentDef) {
        throw new Error(`Agent not found: ${agentType}`);
      }

      const instance = new agentDef.class({
        agentType,
        clientId: options.clientId,
        metadata: agentDef.metadata,
        ...options,
      });

      this.agentInstances.set(instanceKey, instance);
    }

    return this.agentInstances.get(instanceKey);
  }

  /**
   * Get agents by sector
   */
  getAgentsBySector(sector) {
    return this.sectorAgents.get(sector) || [];
  }

  /**
   * Get agents with capability
   */
  getAgentsByCapability(capability) {
    return this.capabilities.get(capability) || [];
  }

  /**
   * Get agent metadata
   */
  getAgentMetadata(agentType) {
    const agent = this.agents.get(agentType);
    return agent ? agent.metadata : null;
  }

  /**
   * List all registered agents
   */
  listAgents() {
    return Array.from(this.agents.entries()).map(([type, def]) => ({
      type,
      ...def.metadata,
    }));
  }

  /**
   * List agents by sector with stats
   */
  listSectors() {
    const sectors = {};
    this.sectorAgents.forEach((agents, sector) => {
      sectors[sector] = {
        count: agents.length,
        agents,
      };
    });
    return sectors;
  }
}

// Global registry instance
const registry = new AgentRegistry();

/**
 * Base Agent Class
 * All sector-specific agents extend this
 */
class Agent {
  constructor(config = {}) {
    this.id = uuidv4();
    this.agentType = config.agentType;
    this.clientId = config.clientId;
    this.metadata = config.metadata || {};
    this.state = 'idle';
    this.activeCallCount = 0;
    this.totalCallsHandled = 0;
    this.successRate = 1.0;
    this.lastActivityTime = Date.now();
    this.callHistory = [];
  }

  /**
   * Initialize agent (load training data, etc)
   */
  async initialize() {
    logger.info(`🚀 Initializing agent: ${this.agentType}`);
    this.state = 'ready';
    return true;
  }

  /**
   * Handle incoming call
   */
  async handleCall(callData) {
    try {
      this.activeCallCount++;
      this.state = 'busy';

      const callId = callData.id || uuidv4();
      const startTime = Date.now();

      logger.info(`📞 ${this.agentType} handling call: ${callId}`);

      // Process call based on agent type
      const result = await this.processCall(callData);

      const duration = Date.now() - startTime;
      this.totalCallsHandled++;
      this.lastActivityTime = Date.now();

      // Track call
      this.callHistory.push({
        callId,
        duration,
        result: result.status,
        timestamp: new Date().toISOString(),
      });

      // Keep last 100 calls
      if (this.callHistory.length > 100) {
        this.callHistory.shift();
      }

      return {
        success: true,
        agentId: this.id,
        agentType: this.agentType,
        callId,
        duration,
        result,
      };
    } catch (error) {
      logger.error(`❌ Error in ${this.agentType}`, { error: error.message });
      return {
        success: false,
        agentId: this.id,
        agentType: this.agentType,
        error: error.message,
      };
    } finally {
      this.activeCallCount--;
      if (this.activeCallCount === 0) {
        this.state = 'idle';
      }
    }
  }

  /**
   * Override in subclasses
   */
  async processCall(callData) {
    return {
      status: 'completed',
      message: 'Call processed',
    };
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      id: this.id,
      agentType: this.agentType,
      state: this.state,
      activeCallCount: this.activeCallCount,
      totalCallsHandled: this.totalCallsHandled,
      successRate: this.successRate,
      lastActivityTime: this.lastActivityTime,
      capabilities: this.metadata.capabilities || [],
    };
  }

  /**
   * Update success rate
   */
  updateSuccessRate(callSuccess) {
    const handled = this.totalCallsHandled;
    const current = this.successRate * handled;
    this.successRate = (current + (callSuccess ? 1 : 0)) / (handled + 1);
  }

  /**
   * Get agent statistics
   */
  getStatistics() {
    return {
      agentType: this.agentType,
      totalCalls: this.totalCallsHandled,
      activeCallCount: this.activeCallCount,
      successRate: this.successRate.toFixed(4),
      avgCallDuration:
        this.callHistory.length > 0
          ? (
              this.callHistory.reduce((sum, call) => sum + call.duration, 0) /
              this.callHistory.length
            ).toFixed(0)
          : 0,
      recentCalls: this.callHistory.slice(-10),
    };
  }
}

module.exports = {
  AgentRegistry,
  Agent,
  registry,
};
