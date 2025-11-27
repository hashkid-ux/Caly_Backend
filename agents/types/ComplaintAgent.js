// agents/types/ComplaintAgent.js
const BaseAgent = require('../BaseAgent');
const logger = require('../../utils/logger');
const db = require('../../db/postgres');

class ComplaintAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['order_id', 'reason'];
    this.agentType = 'ComplaintAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Creating complaint ticket', { callId: this.callId, orderId: this.data.order_id });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'create_complaint',
        params: { order_id: this.data.order_id, reason: this.data.reason },
        confidence: 0.9
      });

      // In a real system, this would integrate with a ticketing system like Zendesk
      const ticketId = 'TKT' + Date.now();

      await db.actions.updateStatus(action.id, 'success', { ticket_id: ticketId });

      this.complete({
        success: true,
        ticketId,
        contextUpdate: `Support ticket created. Ticket ID: ${ticketId}. Our team will contact you within 24 hours.`
      });

    } catch (error) {
      this.handleError(error);
    }
  }
}

module.exports = ComplaintAgent;
