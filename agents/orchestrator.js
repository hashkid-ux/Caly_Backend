// Backend/agents/orchestrator.js - Complete agent orchestration
const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));
const EventEmitter = require('events');

// Import all agents
const OrderLookupAgent = require('./types/OrderLookupAgent');
const ReturnAgent = require('./types/ReturnAgent');
const RefundAgent = require('./types/RefundAgent');
const CancelOrderAgent = require('./types/CancelOrderAgent');
const TrackingAgent = require('./types/TrackingAgent');
const ComplaintAgent = require('./types/ComplaintAgent');
const ProductInquiryAgent = require('./types/ProductInquiryAgent');
const PaymentIssueAgent = require('./types/PaymentIssueAgent');
const AddressChangeAgent = require('./types/AddressChangeAgent');
const {
  ExchangeAgent,
  CODAgent,
  InvoiceAgent,
  RegistrationAgent,
  TechnicalSupportAgent
} = require('./types/RemainingAgents');

class AgentOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.activeAgents = new Map(); // callId -> { agent, state, startTime }
    this.agentRegistry = this.registerAgents();
  }

  /**
   * Register all 14 agents
   */
  registerAgents() {
    return {
      // Core agents
      OrderLookupAgent,
      ReturnAgent,
      RefundAgent,
      CancelOrderAgent,
      TrackingAgent,
      ComplaintAgent,
      
      // New agents
      ProductInquiryAgent,
      PaymentIssueAgent,
      AddressChangeAgent,
      ExchangeAgent,
      CODAgent,
      InvoiceAgent,
      RegistrationAgent,
      TechnicalSupportAgent
    };
  }

  /**
   * Launch agent with optimized execution
   */
  async launchAgent(callId, agentType, initialData = {}) {
    try {
      // Check if agent already active
      if (this.activeAgents.has(callId)) {
        const existing = this.activeAgents.get(callId);
        
        // If same type, update it
        if (existing.agent.constructor.name === agentType) {
          logger.info('Updating existing agent', { callId, agentType });
          existing.agent.updateData(initialData);
          return existing.agent;
        }
        
        // Cancel old agent
        logger.info('Cancelling previous agent', { 
          callId,
          oldAgent: existing.agent.constructor.name,
          newAgent: agentType 
        });
        await this.cancelAgent(callId);
      }

      // Get agent class
      const AgentClass = this.agentRegistry[agentType];
      
      if (!AgentClass) {
        logger.error('Unknown agent type', { agentType });
        throw new Error(`Unknown agent type: ${agentType}`);
      }

      // Create agent instance
      const agent = new AgentClass(callId, initialData);

      // Store agent
      this.activeAgents.set(callId, {
        agent,
        agentType,
        state: 'RUNNING',
        startTime: Date.now()
      });

      logger.info('Agent launched', { 
        callId,
        agentType,
        initialData 
      });

      // Setup handlers
      this.setupAgentHandlers(callId, agent);

      // Execute agent asynchronously
      this.executeAgent(callId, agent);

      return agent;

    } catch (error) {
      logger.error('Error launching agent', { 
        callId,
        agentType,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Setup event handlers for agent
   */
  setupAgentHandlers(callId, agent) {
    // Agent needs more info
    agent.on('need_info', (data) => {
      logger.info('Agent needs info', { 
        callId,
        needed: data.field 
      });
      
      this.emit('agent_needs_info', {
        callId,
        field: data.field,
        prompt: data.prompt
      });
    });

    // Agent completed
    agent.on('completed', (result) => {
      const agentData = this.activeAgents.get(callId);
      const duration = agentData ? Date.now() - agentData.startTime : 0;
      
      logger.info('Agent completed', { 
        callId,
        agentType: agent.constructor.name,
        duration 
      });

      if (agentData) {
        agentData.state = 'COMPLETED';
      }

      this.emit('agent_completed', {
        callId,
        agentType: agent.constructor.name,
        result,
        duration
      });
    });

    // Agent error
    agent.on('error', (error) => {
      logger.error('Agent error', { 
        callId,
        agentType: agent.constructor.name,
        error: error.message 
      });

      const agentData = this.activeAgents.get(callId);
      if (agentData) {
        agentData.state = 'ERROR';
      }

      this.emit('agent_error', {
        callId,
        agentType: agent.constructor.name,
        error
      });
    });
  }

  /**
   * Execute agent asynchronously
   */
  async executeAgent(callId, agent) {
    try {
      await agent.execute();
    } catch (error) {
      logger.error('Agent execution failed', { 
        callId,
        error: error.message 
      });
      agent.emit('error', error);
    }
  }

  /**
   * Update agent with new data
   */
  updateAgent(callId, data) {
    const agentData = this.activeAgents.get(callId);
    
    if (!agentData) {
      logger.warn('No active agent to update', { callId });
      return false;
    }

    logger.info('Updating agent', { 
      callId,
      agentType: agentData.agent.constructor.name,
      data 
    });

    agentData.agent.updateData(data);
    return true;
  }

  /**
   * Cancel active agent
   */
  async cancelAgent(callId) {
    const agentData = this.activeAgents.get(callId);
    
    if (!agentData) {
      logger.debug('No active agent to cancel', { callId });
      return;
    }

    logger.info('Cancelling agent', { 
      callId,
      agentType: agentData.agent.constructor.name 
    });

    try {
      await agentData.agent.cancel();
      agentData.state = 'CANCELLED';

      this.emit('agent_cancelled', {
        callId,
        agentType: agentData.agent.constructor.name
      });

      this.activeAgents.delete(callId);
    } catch (error) {
      logger.error('Error cancelling agent', { 
        callId,
        error: error.message 
      });
    }
  }

  /**
   * Get active agent
   */
  getAgent(callId) {
    const agentData = this.activeAgents.get(callId);
    return agentData ? agentData.agent : null;
  }

  /**
   * Get agent state
   */
  getAgentState(callId) {
    const agentData = this.activeAgents.get(callId);
    return agentData ? {
      agentType: agentData.agentType,
      state: agentData.state,
      startTime: agentData.startTime,
      duration: Date.now() - agentData.startTime
    } : null;
  }

  /**
   * Check if agent is active
   */
  hasActiveAgent(callId) {
    return this.activeAgents.has(callId);
  }

  /**
   * Get all active agents
   */
  getAllActiveAgents() {
    const active = [];
    for (const [callId, agentData] of this.activeAgents) {
      active.push({
        callId,
        agentType: agentData.agentType,
        state: agentData.state,
        duration: Date.now() - agentData.startTime
      });
    }
    return active;
  }

  /**
   * Get agent statistics
   */
  getAgentStats() {
    const stats = {
      totalActive: this.activeAgents.size,
      byType: {},
      byState: {}
    };

    for (const agentData of this.activeAgents.values()) {
      // Count by type
      stats.byType[agentData.agentType] = (stats.byType[agentData.agentType] || 0) + 1;
      
      // Count by state
      stats.byState[agentData.state] = (stats.byState[agentData.state] || 0) + 1;
    }

    return stats;
  }

  /**
   * Cleanup completed agents
   */
  cleanup() {
    const now = Date.now();
    const MAX_AGE = 5 * 60 * 1000; // 5 minutes

    for (const [callId, agentData] of this.activeAgents) {
      if (agentData.state === 'COMPLETED' || agentData.state === 'ERROR') {
        const age = now - agentData.startTime;
        if (age > MAX_AGE) {
          logger.debug('Cleaning up old agent', { 
            callId,
            agentType: agentData.agentType,
            age 
          });
          this.activeAgents.delete(callId);
        }
      }
    }
  }
}

// Singleton instance
const orchestrator = new AgentOrchestrator();

// Cleanup every 2 minutes
setInterval(() => {
  orchestrator.cleanup();
}, 2 * 60 * 1000);

module.exports = orchestrator;