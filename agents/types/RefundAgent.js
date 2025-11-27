// agents/types/RefundAgent.js
const BaseAgent = require('../BaseAgent');
const logger = require('../../utils/logger');
const db = require('../../db/postgres');
const ShopifyService = require('../../services/ShopifyService');

class RefundAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['order_id'];
    this.agentType = 'RefundAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Executing refund request', { callId: this.callId, orderId: this.data.order_id });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'process_refund',
        params: { order_id: this.data.order_id },
        confidence: 0.9
      });

      const orderData = await ShopifyService.getOrder(this.data.order_id);

      if (!orderData) {
        await db.actions.updateStatus(action.id, 'failed', { error: 'Order not found' });
        this.complete({ success: false, message: 'Order not found' });
        return;
      }

      const refundData = await ShopifyService.createRefund(orderData);

      if (!refundData) {
        await db.actions.updateStatus(action.id, 'failed', { error: 'Refund processing failed' });
        throw new Error('Failed to process refund in Shopify');
      }

      await db.actions.updateStatus(action.id, 'success', { refund: refundData });

      this.complete({
        success: true,
        contextUpdate: 'Refund request processed. Amount will be credited in 5-7 business days.'
      });

    } catch (error) {
      this.handleError(error);
    }
  }
}

module.exports = RefundAgent;
