// Backend/agents/orchestratorV2.js - Sector-aware agent orchestration
// ✅ SECTOR EXPANSION: Dynamic agent loading by sector instead of hardcoded registry

const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));
const EventEmitter = require('events');

// Keep old agents as imports (backward compatibility)
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

class AgentOrchestratorV2 extends EventEmitter {
  constructor(database) {
    super();
    this.db = database;
    this.activeAgents = new Map(); // callId -> { agent, state, startTime }
    this.agentCache = new Map(); // sector -> { agents, timestamp }
    this.cacheExpiry = 3600000; // 1 hour
    
    // Hardcoded agents for backward compatibility
    this.legacyAgentRegistry = this.registerLegacyAgents();
  }

  /**
   * Register all legacy (e-commerce) agents
   */
  registerLegacyAgents() {
    return {
      OrderLookupAgent,
      ReturnAgent,
      RefundAgent,
      CancelOrderAgent,
      TrackingAgent,
      ComplaintAgent,
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
   * Load agents for a specific sector from database
   * Falls back to legacy registry if database unavailable
   * @param {string} sector - Business sector (ecommerce, healthcare, realestate, etc.)
   * @returns {Promise<object>} - Map of available agents for sector
   */
  async loadAgentsForSector(sector) {
    // Check cache
    if (this.agentCache.has(sector)) {
      const cached = this.agentCache.get(sector);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        logger.debug('🔄 [Orchestrator] Using cached agents', { sector });
        return cached.agents;
      }
    }

    try {
      if (this.db) {
        // Load agent types from database
        const result = await this.db.query(
          `SELECT agent_type, agent_class, priority FROM sector_agents 
           WHERE sector = $1 AND enabled = TRUE 
           ORDER BY priority ASC`,
          [sector]
        );

        const agents = {};
        for (const row of result.rows) {
          try {
            // Dynamically require agent based on agent_class path
            const AgentClass = require(`./${row.agent_class}`);
            agents[row.agent_type] = AgentClass;
            logger.debug('✅ [Orchestrator] Loaded agent from database', { 
              sector, 
              agentType: row.agent_type,
              agentClass: row.agent_class
            });
          } catch (err) {
            logger.warn('⚠️  [Orchestrator] Failed to load agent', { 
              sector, 
              agentType: row.agent_type,
              error: err.message 
            });
          }
        }

        // Cache the loaded agents
        this.agentCache.set(sector, {
          agents,
          timestamp: Date.now()
        });

        logger.info('✅ [Orchestrator] Sector agents loaded from database', { 
          sector, 
          count: Object.keys(agents).length 
        });
        return agents;
      }
    } catch (err) {
      logger.warn('⚠️  [Orchestrator] Failed to load agents from database, using fallback', { 
        sector,
        error: err.message 
      });
    }

    // Fallback: Return agents for sector (legacy + new placeholders)
    return this.getAgentsForSectorFallback(sector);
  }

  /**
   * Get agents for sector (fallback if database unavailable)
   */
  getAgentsForSectorFallback(sector) {
    const sectorAgents = {
      ecommerce: this.legacyAgentRegistry,
      healthcare: {
        // Healthcare agents (placeholders - to be implemented)
        AppointmentBookingAgent: require('./types/OrderLookupAgent'), // placeholder
        PrescriptionRefillAgent: require('./types/OrderLookupAgent'), // placeholder
        TriageAgent: require('./types/OrderLookupAgent'), // placeholder
        FollowUpAgent: require('./types/OrderLookupAgent'), // placeholder
        PatientInfoAgent: require('./types/OrderLookupAgent') // placeholder
      },
      realestate: {
        // Real Estate agents (placeholders)
        PropertyInquiryAgent: require('./types/OrderLookupAgent'), // placeholder
        ShowingScheduleAgent: require('./types/OrderLookupAgent'), // placeholder
        LeadCaptureAgent: require('./types/OrderLookupAgent'), // placeholder
        OfferStatusAgent: require('./types/OrderLookupAgent') // placeholder
      },
      logistics: {
        // Logistics agents (placeholders)
        TrackingAgent: require('./types/TrackingAgent'), // Can reuse tracking
        PickupScheduleAgent: require('./types/OrderLookupAgent'), // placeholder
        DeliveryFailureAgent: require('./types/OrderLookupAgent'), // placeholder
        AddressAgent: require('./types/AddressChangeAgent') // Can reuse address
      },
      fintech: {
        // Fintech agents (placeholders)
        BalanceCheckAgent: require('./types/OrderLookupAgent'), // placeholder
        TransactionVerifyAgent: require('./types/OrderLookupAgent'), // placeholder
        FraudReportAgent: require('./types/ComplaintAgent') // Can reuse complaint
      }
    };

    const agents = sectorAgents[sector] || this.legacyAgentRegistry;
    logger.debug('📦 [Orchestrator] Using fallback agents', { sector, count: Object.keys(agents).length });
    return agents;
  }

  /**
   * Clear agent cache (for testing or forcing refresh)
   */
  clearAgentCache() {
    this.agentCache.clear();
    logger.debug('🗑️  [Orchestrator] Agent cache cleared');
  }

  /**
   * Launch agent with sector awareness
   * @param {string} callId - Unique call ID
   * @param {string} agentType - Type of agent to launch
   * @param {string} sector - Business sector
   * @param {object} initialData - Data to pass to agent
   * @returns {Promise<object>} - The launched agent instance
   */
  async launchAgent(callId, agentType, sector = 'ecommerce', initialData = {}) {
    try {
      // Load agents for this sector
      const availableAgents = await this.loadAgentsForSector(sector);

      // Check if agent exists for this sector
      if (!availableAgents[agentType]) {
        logger.warn('❌ [Orchestrator] Agent not available for sector', { 
          callId, 
          agentType, 
          sector,
          availableAgents: Object.keys(availableAgents)
        });
        throw new Error(`Agent ${agentType} not available for sector ${sector}`);
      }

      // Check if agent already active
      if (this.activeAgents.has(callId)) {
        const existing = this.activeAgents.get(callId);
        
        if (existing.agent.constructor.name === agentType) {
          logger.info('✅ [Orchestrator] Updating existing agent', { callId, agentType, sector });
          existing.agent.updateData(initialData);
          return existing.agent;
        }
        
        logger.info('🔄 [Orchestrator] Cancelling previous agent and launching new one', { 
          callId,
          oldAgent: existing.agent.constructor.name,
          newAgent: agentType,
          sector
        });
        await this.cancelAgent(callId);
      }

      // Launch new agent instance
      const AgentClass = availableAgents[agentType];
      const agent = new AgentClass(callId, initialData);

      // Track active agent
      this.activeAgents.set(callId, {
        agent,
        state: 'active',
        startTime: Date.now(),
        sector
      });

      logger.info('🚀 [Orchestrator] Agent launched', { 
        callId, 
        agentType, 
        sector,
        activeAgents: this.activeAgents.size 
      });

      return agent;
    } catch (err) {
      logger.error('❌ [Orchestrator] Failed to launch agent', { 
        callId, 
        agentType, 
        sector,
        error: err.message 
      });
      throw err;
    }
  }

  /**
   * Get appropriate agent for detected intent
   * @param {string} intent - Detected intent
   * @param {string} sector - Business sector
   * @returns {Promise<string>} - Agent type that should handle this intent
   */
  async getAgentForIntent(intent, sector = 'ecommerce') {
    // Mapping of intents to agent types (sector-specific)
    const intentToAgentMap = {
      ecommerce: {
        ORDER_LOOKUP: 'OrderLookupAgent',
        ORDER_STATUS: 'OrderLookupAgent',
        RETURN_REQUEST: 'ReturnAgent',
        REFUND: 'RefundAgent',
        CANCEL_ORDER: 'CancelOrderAgent',
        TRACKING: 'TrackingAgent',
        PRODUCT_INQUIRY: 'ProductInquiryAgent',
        PAYMENT_ISSUE: 'PaymentIssueAgent',
        ADDRESS_CHANGE: 'AddressChangeAgent',
        COMPLAINT: 'ComplaintAgent',
        EXCHANGE: 'ExchangeAgent',
        COD_ISSUE: 'CODAgent',
        INVOICE: 'InvoiceAgent',
        REGISTRATION: 'RegistrationAgent',
        TECHNICAL_SUPPORT: 'TechnicalSupportAgent'
      },
      healthcare: {
        BOOK_APPOINTMENT: 'AppointmentBookingAgent',
        PRESCRIPTION_REFILL: 'PrescriptionRefillAgent',
        SYMPTOM_CHECK: 'TriageAgent',
        APPOINTMENT_REMINDER: 'FollowUpAgent',
        RESCHEDULE_APPOINTMENT: 'AppointmentBookingAgent',
        PATIENT_INFO: 'PatientInfoAgent'
      },
      realestate: {
        PROPERTY_INQUIRY: 'PropertyInquiryAgent',
        SCHEDULE_SHOWING: 'ShowingScheduleAgent',
        LEAD_CAPTURE: 'LeadCaptureAgent',
        MAKE_OFFER: 'LeadCaptureAgent',
        OFFER_STATUS: 'OfferStatusAgent'
      },
      logistics: {
        TRACK_PARCEL: 'TrackingAgent',
        SCHEDULE_PICKUP: 'PickupScheduleAgent',
        DELIVERY_FAILURE: 'DeliveryFailureAgent',
        ADDRESS_UPDATE: 'AddressAgent'
      },
      fintech: {
        CHECK_BALANCE: 'BalanceCheckAgent',
        VERIFY_TRANSACTION: 'TransactionVerifyAgent',
        REPORT_FRAUD: 'FraudReportAgent'
      }
    };

    const sectorMap = intentToAgentMap[sector] || intentToAgentMap.ecommerce;
    const agentType = sectorMap[intent];

    if (!agentType) {
      logger.warn('⚠️  [Orchestrator] No agent mapped for intent', { intent, sector });
      return 'ComplaintAgent'; // Default to complaint agent for unknown intents
    }

    return agentType;
  }

  /**
   * Cancel active agent
   */
  async cancelAgent(callId) {
    if (!this.activeAgents.has(callId)) {
      return;
    }

    const entry = this.activeAgents.get(callId);
    try {
      if (entry.agent && typeof entry.agent.cancel === 'function') {
        await entry.agent.cancel();
      }
      this.activeAgents.delete(callId);
      logger.info('🛑 [Orchestrator] Agent cancelled', { callId });
    } catch (err) {
      logger.error('❌ [Orchestrator] Error cancelling agent', { callId, error: err.message });
    }
  }

  /**
   * Get active agent for a call
   */
  getActiveAgent(callId) {
    return this.activeAgents.get(callId);
  }

  /**
   * Get all active agents
   */
  getActiveAgents() {
    return Array.from(this.activeAgents.values());
  }

  /**
   * Health check: count active agents and monitor
   */
  getHealth() {
    const active = this.activeAgents.size;
    const maxActive = 1000;
    const utilization = (active / maxActive) * 100;

    return {
      activeAgents: active,
      maxCapacity: maxActive,
      utilizationPercent: utilization.toFixed(2),
      healthy: active < maxActive,
      cachedSectors: this.agentCache.size
    };
  }
}

module.exports = AgentOrchestratorV2;
