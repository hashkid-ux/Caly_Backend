// agents/types/CancelOrderAgent.js
const BaseAgent = require('../BaseAgent');
const logger = require('../../utils/logger');
const db = require('../../db/postgres');
const ShopifyService = require('../../services/ShopifyService');

class CancelOrderAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['order_id'];
    this.agentType = 'CancelOrderAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Executing order cancellation', { callId: this.callId, orderId: this.data.order_id });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'cancel_order',
        params: { order_id: this.data.order_id },
        confidence: 0.9
      });

      const orderData = await ShopifyService.getOrder(this.data.order_id);

      if (!orderData) {
        await db.actions.updateStatus(action.id, 'failed', { error: 'Order not found' });
        this.complete({ success: false, message: 'Order not found' });
        return;
      }

      // Add eligibility check here (e.g., if order is already shipped)

      const cancellationData = await ShopifyService.cancelOrder(orderData);

      if (!cancellationData) {
        await db.actions.updateStatus(action.id, 'failed', { error: 'Cancellation failed' });
        throw new Error('Failed to cancel order in Shopify');
      }

      await db.actions.updateStatus(action.id, 'success', { cancellation: cancellationData });

      this.complete({
        success: true,
        contextUpdate: 'Order cancelled successfully. Refund will be processed within 24 hours.'
      });

    } catch (error) {
      this.handleError(error);
    }
  }
}

module.exports = CancelOrderAgent;
