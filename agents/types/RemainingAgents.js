// Backend/agents/types/ExchangeAgent.js
const BaseAgent = require('../BaseAgent');
const logger = require('../../utils/logger');
const db = require('../../db/postgres');
const ShopifyService = require('../../services/ShopifyService');

class ExchangeAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['order_id', 'reason'];
    this.agentType = 'ExchangeAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Executing exchange request', { 
        callId: this.callId,
        orderId: this.data.order_id 
      });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'create_exchange',
        params: { 
          order_id: this.data.order_id,
          reason: this.data.reason,
          exchange_for: this.data.exchange_for
        },
        confidence: 0.9
      });

      const orderData = await ShopifyService.getOrder(this.data.order_id);

      if (!orderData) {
        await db.actions.updateStatus(action.id, 'failed', { error: 'Order not found' });
        this.complete({ success: false, message: 'Order not found' });
        return;
      }

      // Check exchange eligibility (similar to return)
      const eligibility = this.checkExchangeEligibility(orderData);
      if (!eligibility.eligible) {
        await db.actions.updateStatus(action.id, 'failed', { error: eligibility.reason });
        this.complete({
          success: false,
          message: eligibility.reason,
          contextUpdate: `Exchange not eligible: ${eligibility.reason}`
        });
        return;
      }

      // Create exchange request
      const exchangeData = await ShopifyService.createExchange({
        order_id: orderData.id,
        line_items: orderData.line_items,
        reason: this.data.reason,
        exchange_variant: this.data.exchange_for
      });

      // Schedule pickup
      const pickupData = await ShopifyService.schedulePickup(orderData, exchangeData);

      await db.actions.updateStatus(action.id, 'success', { 
        exchange: exchangeData,
        pickup: pickupData 
      });

      this.complete({
        success: true,
        exchangeData,
        pickupData,
        contextUpdate: `Exchange request created. Pickup scheduled for ${this.formatDate(pickupData.scheduled_date)}. New item will be shipped after receiving original.`
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  checkExchangeEligibility(orderData) {
    if (orderData.fulfillment_status !== 'fulfilled') {
      return { eligible: false, reason: 'Order not yet delivered' };
    }
    const daysSinceDelivery = Math.floor(
      (new Date() - new Date(orderData.fulfilled_at)) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceDelivery > 14) {
      return { eligible: false, reason: 'Exchange window expired (14 days)' };
    }
    return { eligible: true };
  }

  formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-IN', { 
      day: 'numeric', month: 'short' 
    });
  }
}

// ============================================
// Backend/agents/types/CODAgent.js
// ============================================

class CODAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['order_id'];
    this.agentType = 'CODAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Handling COD query', { callId: this.callId, orderId: this.data.order_id });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'cod_inquiry',
        params: { order_id: this.data.order_id },
        confidence: 0.9
      });

      const orderData = await ShopifyService.getOrder(this.data.order_id);

      if (!orderData) {
        await db.actions.updateStatus(action.id, 'failed', { error: 'Order not found' });
        this.complete({ success: false, message: 'Order not found' });
        return;
      }

      const codInfo = {
        is_cod: orderData.gateway === 'cash_on_delivery',
        amount: orderData.total_price,
        status: orderData.fulfillment_status,
        delivery_instructions: 'Keep exact cash ready. Delivery executive will collect payment.'
      };

      await db.actions.updateStatus(action.id, 'success', { cod_info: codInfo });

      let contextUpdate = '';
      if (codInfo.is_cod) {
        contextUpdate = `This is a Cash on Delivery order. Amount to pay: ₹${codInfo.amount}. Please keep exact cash ready when delivery arrives.`;
      } else {
        contextUpdate = `This order is already paid online. No cash payment needed at delivery.`;
      }

      this.complete({
        success: true,
        codInfo,
        contextUpdate: contextUpdate + ' Explain naturally in Hindi.'
      });
    } catch (error) {
      this.handleError(error);
    }
  }
}

// ============================================
// Backend/agents/types/InvoiceAgent.js
// ============================================

class InvoiceAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['order_id'];
    this.agentType = 'InvoiceAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Generating invoice', { callId: this.callId, orderId: this.data.order_id });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'generate_invoice',
        params: { order_id: this.data.order_id },
        confidence: 0.9
      });

      const orderData = await ShopifyService.getOrder(this.data.order_id);

      if (!orderData) {
        await db.actions.updateStatus(action.id, 'failed', { error: 'Order not found' });
        this.complete({ success: false, message: 'Order not found' });
        return;
      }

      // Generate invoice PDF
      const invoiceUrl = await ShopifyService.generateInvoice(orderData.id);

      // Send via email/SMS
      await ShopifyService.sendInvoice(
        orderData.email,
        orderData.phone || this.data.phone,
        invoiceUrl
      );

      await db.actions.updateStatus(action.id, 'success', { invoice_url: invoiceUrl });

      this.complete({
        success: true,
        invoiceUrl,
        contextUpdate: `Invoice generated and sent to email: ${orderData.email}. Also sending via SMS. Total amount: ₹${orderData.total_price} (including GST). Explain in Hindi.`
      });
    } catch (error) {
      this.handleError(error);
    }
  }
}

// ============================================
// Backend/agents/types/RegistrationAgent.js
// ============================================

class RegistrationAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['phone', 'email'];
    this.agentType = 'RegistrationAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Registering new customer', { 
        callId: this.callId,
        phone: this.data.phone 
      });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'register_customer',
        params: { 
          phone: this.data.phone,
          email: this.data.email,
          name: this.data.name
        },
        confidence: 0.9
      });

      // Create customer in Shopify
      const customerData = await ShopifyService.createCustomer({
        phone: this.data.phone,
        email: this.data.email,
        first_name: this.data.name || 'Customer',
        tags: 'voice_registered'
      });

      if (!customerData) {
        throw new Error('Failed to register customer');
      }

      // Send welcome SMS/Email
      await ShopifyService.sendWelcomeMessage(
        this.data.phone,
        this.data.email,
        this.data.name
      );

      await db.actions.updateStatus(action.id, 'success', { customer: customerData });

      this.complete({
        success: true,
        customerData,
        contextUpdate: `Customer registered successfully! Welcome email and SMS sent. Customer can now place orders. Explain in Hindi and share any welcome offers.`
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  getPromptForField(field) {
    if (field === 'phone') {
      return 'Ask: "Ji sir, aapka mobile number batayiye please, account banane ke liye"';
    }
    if (field === 'email') {
      return 'Ask: "Ji sir, email address batayiye please"';
    }
    if (field === 'name') {
      return 'Ask: "Ji sir, aapka naam kya hai?"';
    }
    return super.getPromptForField(field);
  }
}

// ============================================
// Backend/agents/types/TechnicalSupportAgent.js
// ============================================

class TechnicalSupportAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['issue_description'];
    this.agentType = 'TechnicalSupportAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Handling technical support', { 
        callId: this.callId,
        issue: this.data.issue_description 
      });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'technical_support',
        params: { 
          issue: this.data.issue_description,
          platform: this.data.platform || 'unknown'
        },
        confidence: 0.85
      });

      // Categorize issue
      const issueType = this.categorizeIssue(this.data.issue_description);

      // Provide solution based on issue type
      const solution = this.getSolution(issueType);

      // If complex, create support ticket
      let ticketId = null;
      if (issueType.requires_ticket) {
        ticketId = await this.createSupportTicket(this.data.issue_description);
      }

      await db.actions.updateStatus(action.id, 'success', { 
        issue_type: issueType,
        solution,
        ticket_id: ticketId
      });

      this.complete({
        success: true,
        issueType,
        solution,
        ticketId,
        contextUpdate: this.formatSolution(issueType, solution, ticketId)
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  categorizeIssue(description) {
    const lower = description.toLowerCase();
    
    if (lower.includes('login') || lower.includes('password')) {
      return { type: 'login_issue', requires_ticket: false };
    }
    if (lower.includes('app') && (lower.includes('crash') || lower.includes('nahi chal'))) {
      return { type: 'app_crash', requires_ticket: true };
    }
    if (lower.includes('website') || lower.includes('error')) {
      return { type: 'website_error', requires_ticket: false };
    }
    if (lower.includes('payment')) {
      return { type: 'payment_gateway', requires_ticket: true };
    }
    
    return { type: 'general', requires_ticket: true };
  }

  getSolution(issueType) {
    const solutions = {
      login_issue: 'Try resetting password via "Forgot Password" link. Check email for reset link.',
      app_crash: 'Clear app cache and update to latest version. If issue persists, uninstall and reinstall app.',
      website_error: 'Clear browser cache and cookies. Try different browser or incognito mode.',
      payment_gateway: 'Technical team will investigate payment issue and contact within 2 hours.',
      general: 'Technical support team will review and contact you within 24 hours.'
    };
    
    return solutions[issueType.type] || solutions.general;
  }

  async createSupportTicket(issueDescription) {
    const ticketId = 'TECH' + Date.now();
    // In production, integrate with Zendesk/Freshdesk
    logger.info('Support ticket created', { ticketId, issue: issueDescription });
    return ticketId;
  }

  formatSolution(issueType, solution, ticketId) {
    let context = `Technical Support:\n`;
    context += `- Issue: ${issueType.type}\n`;
    context += `- Solution: ${solution}\n`;
    
    if (ticketId) {
      context += `- Ticket ID: ${ticketId}\n`;
      context += `- Support team will contact you within 24 hours\n`;
    }
    
    context += `\nExplain solution clearly in Hindi. Be patient and helpful.`;
    return context;
  }

  getPromptForField(field) {
    if (field === 'issue_description') {
      return 'Ask: "Ji sir, kya problem aa rahi hai? Thoda detail mein batayiye"';
    }
    return super.getPromptForField(field);
  }
}

module.exports = {
  ExchangeAgent,
  CODAgent,
  InvoiceAgent,
  RegistrationAgent,
  TechnicalSupportAgent
};