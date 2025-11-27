// agents/types/TrackingAgent.js
const BaseAgent = require('../BaseAgent');
const logger = require('../../utils/logger');
const db = require('../../db/postgres');
const ShopifyService = require('../../services/ShopifyService');

class TrackingAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['order_id'];
    this.agentType = 'TrackingAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Executing order tracking', { callId: this.callId, orderId: this.data.order_id });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'track_order',
        params: { order_id: this.data.order_id },
        confidence: 0.9
      });

      const orderData = await ShopifyService.getOrder(this.data.order_id);

      if (!orderData) {
        await db.actions.updateStatus(action.id, 'failed', { error: 'Order not found' });
        this.complete({ success: false, message: 'Order not found' });
        return;
      }

      let trackingInfo = null;
      if (orderData.tracking_number) {
        trackingInfo = await ShopifyService.getTrackingInfo(orderData.tracking_number);
      }

      await db.actions.updateStatus(action.id, 'success', { tracking: trackingInfo });

      this.complete({
        success: true,
        tracking: trackingInfo,
        contextUpdate: `Package is out for delivery. Expected arrival: Today by 6 PM.`
      });

    } catch (error) {
      this.handleError(error);
    }
  }
}

module.exports = TrackingAgent;
