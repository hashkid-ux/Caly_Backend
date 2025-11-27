// agents/BaseAgent.js - Base class for all agents
const EventEmitter = require('events');
const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

// Agent execution timeout (30 seconds)
const AGENT_TIMEOUT_MS = 30000;

class BaseAgent extends EventEmitter {
  constructor(callId, initialData = {}) {
    super();
    this.callId = callId;
    this.data = initialData;
    this.state = 'INITIALIZING';
    this.requiredFields = []; // Override in subclass
    this.result = null;
    this.isCancelled = false;
    this.timeoutHandle = null;
    
    // Prevent memory leaks from too many listeners
    this.setMaxListeners(10);
  }

  /**
   * Check if agent has all required data
   */
  hasRequiredData() {
    for (const field of this.requiredFields) {
      if (!this.data[field]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get missing required fields
   */
  getMissingFields() {
    return this.requiredFields.filter(field => !this.data[field]);
  }

  /**
   * Request missing information
   */
  requestMissingInfo() {
    const missing = this.getMissingFields();
    
    if (missing.length === 0) {
      return;
    }

    const field = missing[0]; // Request one at a time
    
    logger.info('Agent requesting info', { 
      callId: this.callId,
      field,
      agentType: this.constructor.name 
    });

    // Get appropriate prompt for field
    const prompt = this.getPromptForField(field);

    this.emit('need_info', {
      field,
      prompt
    });
  }

  /**
   * Get prompt for field (override in subclass for custom prompts)
   */
  getPromptForField(field) {
    const prompts = {
      order_id: 'Order ID required',
      phone: 'Phone number required',
      email: 'Email required',
      reason: 'Reason required',
      pin_code: 'PIN code required'
    };

    return prompts[field] || `${field} required`;
  }

  /**
   * Update agent data
   */
  updateData(newData) {
    this.data = { ...this.data, ...newData };
    
    logger.debug('Agent data updated', { 
      callId: this.callId,
      agentType: this.constructor.name,
      data: this.data 
    });

    // If we now have required data, continue execution
    if (this.state === 'WAITING_FOR_INFO' && this.hasRequiredData()) {
      this.state = 'RUNNING';
      this.continueExecution();
    }
  }

  /**
   * Main execution logic - OVERRIDE in subclass
   */
  async execute() {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Continue execution after receiving info
   */
  async continueExecution() {
    try {
      this.startTimeout();
      await this.execute();
      this.clearTimeout();
    } catch (error) {
      this.clearTimeout();
      this.handleError(error);
    }
  }

  /**
   * Start agent execution timeout
   */
  startTimeout() {
    this.timeoutHandle = setTimeout(() => {
      if (!this.isCancelled && this.state === 'RUNNING') {
        logger.warn('Agent execution timeout', {
          callId: this.callId,
          agentType: this.constructor.name
        });
        this.handleError(new Error('Agent execution timeout'));
      }
    }, AGENT_TIMEOUT_MS);
  }

  /**
   * Clear execution timeout
   */
  clearTimeout() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /**
   * Cancel agent execution
   */
  async cancel() {
    logger.info('Agent cancelled', { 
      callId: this.callId,
      agentType: this.constructor.name 
    });
    
    this.isCancelled = true;
    this.state = 'CANCELLED';
    this.clearTimeout();
    this.removeAllListeners(); // Clean up event listeners to prevent memory leaks
  }

  /**
   * Complete agent with result
   */
  complete(result) {
    if (this.isCancelled) {
      return;
    }

    this.result = result;
    this.state = 'COMPLETED';

    logger.info('Agent completed', { 
      callId: this.callId,
      agentType: this.constructor.name,
      result 
    });

    this.emit('completed', result);
  }

  /**
   * Handle error
   */
  handleError(error) {
    logger.error('Agent error', { 
      callId: this.callId,
      agentType: this.constructor.name,
      error: error.message 
    });

    this.state = 'ERROR';
    this.clearTimeout();
    this.emit('error', error);
    this.removeAllListeners(); // Clean up on error
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      state: this.state,
      hasRequiredData: this.hasRequiredData(),
      missingFields: this.getMissingFields(),
      result: this.result
    };
  }
}

module.exports = BaseAgent;