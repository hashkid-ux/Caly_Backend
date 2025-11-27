// Backend/agents/types/PaymentIssueAgent.js
const BaseAgent = require('../BaseAgent');
const logger = require('../../utils/logger');
const db = require('../../db/postgres');
const ShopifyService = require('../../services/ShopifyService');

class PaymentIssueAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['order_id'];
    this.agentType = 'PaymentIssueAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Executing payment issue resolution', { 
        callId: this.callId,
        orderId: this.data.order_id,
        issueType: this.data.issue_type 
      });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'resolve_payment_issue',
        params: { 
          order_id: this.data.order_id,
          issue_type: this.data.issue_type,
          transaction_id: this.data.transaction_id
        },
        confidence: 0.9
      });

      // Fetch order and payment details in parallel
      const [orderData, transactions] = await Promise.all([
        ShopifyService.getOrder(this.data.order_id),
        ShopifyService.getOrderTransactions(this.data.order_id)
      ]);

      if (!orderData) {
        await db.actions.updateStatus(action.id, 'failed', { error: 'Order not found' });
        this.complete({
          success: false,
          message: 'Order not found',
          contextUpdate: 'Order not found. Please verify order number with customer.'
        });
        return;
      }

      // Analyze payment status
      const paymentAnalysis = this.analyzePaymentStatus(orderData, transactions);

      // Handle different payment issues
      let resolution;
      switch (paymentAnalysis.issue) {
        case 'payment_failed':
          resolution = await this.handleFailedPayment(orderData, transactions);
          break;
        case 'payment_pending':
          resolution = await this.handlePendingPayment(orderData, transactions);
          break;
        case 'double_charge':
          resolution = await this.handleDoubleCharge(orderData, transactions);
          break;
        case 'refund_pending':
          resolution = await this.handleRefundStatus(orderData, transactions);
          break;
        default:
          resolution = { status: 'no_issue', message: 'Payment is successful' };
      }

      await db.actions.updateStatus(action.id, 'success', { 
        analysis: paymentAnalysis,
        resolution 
      });

      this.complete({
        success: true,
        analysis: paymentAnalysis,
        resolution,
        contextUpdate: this.formatResolution(paymentAnalysis, resolution)
      });

    } catch (error) {
      this.handleError(error);
    }
  }

  analyzePaymentStatus(orderData, transactions) {
    const financialStatus = orderData.financial_status;
    
    // Check for failed payments
    const failedTransactions = transactions.filter(t => t.status === 'failure');
    if (failedTransactions.length > 0) {
      return {
        issue: 'payment_failed',
        status: financialStatus,
        failedCount: failedTransactions.length,
        lastFailure: failedTransactions[failedTransactions.length - 1]
      };
    }

    // Check for pending payments
    if (financialStatus === 'pending' || financialStatus === 'authorized') {
      return {
        issue: 'payment_pending',
        status: financialStatus,
        waitingTime: this.calculateWaitingTime(transactions)
      };
    }

    // Check for double charges
    const successfulCharges = transactions.filter(t => 
      t.kind === 'sale' && t.status === 'success'
    );
    if (successfulCharges.length > 1) {
      return {
        issue: 'double_charge',
        status: financialStatus,
        chargeCount: successfulCharges.length,
        totalCharged: successfulCharges.reduce((sum, t) => sum + parseFloat(t.amount), 0)
      };
    }

    // Check refund status
    const refunds = transactions.filter(t => t.kind === 'refund');
    if (refunds.length > 0 && refunds[0].status === 'pending') {
      return {
        issue: 'refund_pending',
        status: financialStatus,
        refundAmount: refunds[0].amount
      };
    }

    return {
      issue: 'none',
      status: financialStatus
    };
  }

  async handleFailedPayment(orderData, transactions) {
    const lastFailure = transactions.filter(t => t.status === 'failure').slice(-1)[0];
    
    return {
      action: 'retry_payment',
      failureReason: lastFailure?.message || 'Unknown error',
      suggestion: 'Customer can retry payment or use different payment method',
      paymentLink: await ShopifyService.generatePaymentLink(orderData.id)
    };
  }

  async handlePendingPayment(orderData, transactions) {
    return {
      action: 'wait_or_retry',
      waitTime: '2-3 hours',
      suggestion: 'Payment is being processed. Usually takes 2-3 hours to confirm.'
    };
  }

  async handleDoubleCharge(orderData, transactions) {
    // Create automatic refund for duplicate charge
    const refundResult = await ShopifyService.createRefund(orderData.id, {
      amount: parseFloat(orderData.total_price),
      reason: 'Duplicate charge'
    });

    return {
      action: 'refund_initiated',
      refundAmount: orderData.total_price,
      refundId: refundResult?.id,
      timeline: '5-7 business days'
    };
  }

  async handleRefundStatus(orderData, transactions) {
    const refund = transactions.find(t => t.kind === 'refund');
    
    return {
      action: 'refund_processing',
      refundAmount: refund.amount,
      expectedDate: this.calculateRefundDate(refund.created_at)
    };
  }

  calculateWaitingTime(transactions) {
    const latestTx = transactions.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];
    
    const now = new Date();
    const txDate = new Date(latestTx.created_at);
    const hoursPassed = Math.floor((now - txDate) / (1000 * 60 * 60));
    
    return `${hoursPassed} hours`;
  }

  calculateRefundDate(createdAt) {
    const date = new Date(createdAt);
    date.setDate(date.getDate() + 7);
    return date.toLocaleDateString('en-IN');
  }

  formatResolution(analysis, resolution) {
    let context = `Payment Issue Resolution:\n`;
    context += `- Issue Type: ${analysis.issue}\n`;
    context += `- Status: ${analysis.status}\n`;
    
    switch (analysis.issue) {
      case 'payment_failed':
        context += `- Failure Reason: ${resolution.failureReason}\n`;
        context += `- Solution: Customer can retry payment using the link we'll send via SMS\n`;
        break;
      case 'payment_pending':
        context += `- Wait Time: ${resolution.waitTime}\n`;
        context += `- Solution: Payment is being processed by bank, will confirm soon\n`;
        break;
      case 'double_charge':
        context += `- Refund Initiated: ₹${resolution.refundAmount}\n`;
        context += `- Timeline: ${resolution.timeline}\n`;
        break;
      case 'refund_pending':
        context += `- Refund Amount: ₹${resolution.refundAmount}\n`;
        context += `- Expected Date: ${resolution.expectedDate}\n`;
        break;
      default:
        context += `- No issues found with payment\n`;
    }

    context += `\nExplain this to customer naturally in Hindi. Be reassuring and helpful.`;
    return context;
  }

  getPromptForField(field) {
    if (field === 'order_id') {
      return 'Ask user: "Ji sir, payment issue ke liye apna order number batayiye please"';
    }
    return super.getPromptForField(field);
  }
}

module.exports = PaymentIssueAgent;