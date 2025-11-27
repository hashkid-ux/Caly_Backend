// agents/types/ReturnAgent.js - Return request agent
const BaseAgent = require('../BaseAgent');
const logger = require('../../utils/logger');
const db = require('../../db/postgres');
const ShopifyService = require('../../services/ShopifyService');

class ReturnAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['order_id'];
    this.agentType = 'ReturnAgent';
  }

  /**
   * Execute return request
   */
  async execute() {
    try {
      // Check if we have required data
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';

      logger.info('Executing return request', { 
        callId: this.callId,
        orderId: this.data.order_id,
        reason: this.data.reason 
      });

      // Log action to database
      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'create_return',
        params: { 
          order_id: this.data.order_id,
          reason: this.data.reason || 'Customer request'
        },
        confidence: 0.9
      });

      // Step 1: Get order details
      const orderData = await ShopifyService.getOrder(this.data.order_id);

      if (!orderData) {
        await db.actions.updateStatus(action.id, 'failed', {
          error: 'Order not found'
        });

        this.complete({
          success: false,
          message: 'Order not found',
          contextUpdate: `Order ID ${this.data.order_id} not found. Cannot process return.`
        });
        return;
      }

      // Step 2: Check return eligibility
      const eligibility = this.checkReturnEligibility(orderData);
      
      if (!eligibility.eligible) {
        await db.actions.updateStatus(action.id, 'failed', {
          error: eligibility.reason
        });

        this.complete({
          success: false,
          message: eligibility.reason,
          contextUpdate: `Return not eligible for order ${this.data.order_id}. Reason: ${eligibility.reason}`
        });
        return;
      }

      // Step 3: Create return request
      const returnData = await ShopifyService.createReturn({
        order_id: orderData.id,
        line_items: orderData.line_items.map(item => ({
          id: item.id,
          quantity: item.quantity
        })),
        reason: this.data.reason || 'Customer request',
        customer_note: this.data.customer_note
      });

      if (!returnData) {
        throw new Error('Failed to create return request in Shopify');
      }

      // Step 4: Schedule pickup (if applicable)
      let pickupData = null;
      if (returnData.requires_pickup) {
        pickupData = await ShopifyService.schedulePickup(orderData, returnData);
      }

      // Update action status
      await db.actions.updateStatus(action.id, 'success', {
        return_request: returnData,
        pickup: pickupData
      });

      // Format context update
      const contextUpdate = this.formatContextUpdate(returnData, pickupData);

      // Complete agent
      this.complete({
        success: true,
        returnData,
        pickupData,
        contextUpdate
      });

    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Check if order is eligible for return
   */
  checkReturnEligibility(orderData) {
    // Check if order is delivered
    if (orderData.fulfillment_status !== 'fulfilled') {
      return {
        eligible: false,
        reason: 'Order has not been delivered yet'
      };
    }

    // Check return window (14 days by default)
    const deliveryDate = new Date(orderData.fulfilled_at);
    const now = new Date();
    const daysSinceDelivery = Math.floor((now - deliveryDate) / (1000 * 60 * 60 * 24));
    
    const returnWindow = 14; // Can be configured per client
    
    if (daysSinceDelivery > returnWindow) {
      return {
        eligible: false,
        reason: `Return window expired (${returnWindow} days from delivery)`
      };
    }

    // Check if already returned
    if (orderData.cancelled_at) {
      return {
        eligible: false,
        reason: 'Order already cancelled'
      };
    }

    return {
      eligible: true,
      reason: 'Eligible for return'
    };
  }


  /**
   * Format context update for AI
   */
  formatContextUpdate(returnData, pickupData) {
    let context = `Return request created successfully!\n`;
    context += `- Return ID: ${returnData.return_id || 'RET' + Date.now()}\n`;
    
    if (pickupData) {
      context += `\nPickup Details:\n`;
      context += `- Scheduled: ${this.formatPickupDate(pickupData.scheduled_date)}\n`;
      context += `- Time: ${pickupData.time_slot}\n`;
      context += `- Status: Pickup scheduled\n`;
    }

    context += `\nRefund will be processed within 5-7 business days after pickup.\n`;
    context += `Tell customer this information naturally in Hindi. Be reassuring and helpful.`;

    return context;
  }

  /**
   * Format pickup date
   */
  formatPickupDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }

    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  }

  /**
   * Get prompt for missing field
   */
  getPromptForField(field) {
    if (field === 'order_id') {
      return 'Ask user: "Ji sir, return ke liye apna order number batayiye please"';
    }
    if (field === 'reason') {
      return 'Ask user: "Ji sir, return ki wajah batayiye - product galat hai ya koi aur problem hai?"';
    }
    return super.getPromptForField(field);
  }
}

module.exports = ReturnAgent;
