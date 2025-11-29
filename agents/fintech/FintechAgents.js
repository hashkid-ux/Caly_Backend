// Backend/agents/fintech/FintechAgents.js
// ✅ PHASE 3: Fintech sector specialized agents

const BaseAgent = require('../BaseAgent');
const resolve = require('../../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

/**
 * BalanceCheckAgent
 * Provides account balance and account summary information
 */
class BalanceCheckAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['account_id'];
    this.sector = 'fintech';
    this.agentType = 'CHECK_BALANCE';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('💰 [Fintech] Checking account balance', { 
        callId: this.callId,
        account_id: this.data.account_id
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Fetch account balance (in production, would query banking API with OAuth)
      const balanceData = this.getAccountBalance(this.data.account_id);

      if (!balanceData) {
        this.emit('error', {
          message: 'Account not found. Please verify your account ID.',
          field: 'account_id'
        });
        return;
      }

      // Format balance information
      const balanceMessage = this.formatBalanceMessage(balanceData);

      this.result = {
        status: 'success',
        account_id: this.data.account_id,
        current_balance: balanceData.balance,
        available_balance: balanceData.available_balance,
        pending_transactions: balanceData.pending_count,
        message: balanceMessage
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Fintech] Balance information provided', { 
        callId: this.callId,
        account_id: this.data.account_id,
        balance: balanceData.balance
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Fintech] Balance check error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      account_id: 'What is your account ID or the last 4 digits of your account number?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getAccountBalance(accountId) {
    // Mock data - in production would query secure banking APIs
    return {
      account_id: accountId,
      balance: '$5,432.50',
      available_balance: '$5,200.00',
      pending_count: 2,
      last_updated: 'Just now'
    };
  }

  formatBalanceMessage(data) {
    return `Your current balance is ${data.balance}. Available balance: ${data.available_balance}. ` +
           `You have ${data.pending_count} pending transaction(s).`;
  }
}

/**
 * TransactionVerifyAgent
 * Verifies transactions, handles OTP, and confirms transaction authorization
 */
class TransactionVerifyAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['transaction_id', 'otp'];
    this.sector = 'fintech';
    this.agentType = 'VERIFY_TRANSACTION';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🔐 [Fintech] Verifying transaction', { 
        callId: this.callId,
        transaction_id: this.data.transaction_id
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Get transaction details (in production, would query transaction DB)
      const transactionData = this.getTransactionDetails(this.data.transaction_id);

      if (!transactionData) {
        this.emit('error', {
          message: 'Transaction not found.',
          field: 'transaction_id'
        });
        return;
      }

      // Verify OTP (in production, would validate against sent OTP)
      if (!this.verifyOTP(this.data.otp, transactionData.sent_otp)) {
        // Track failed attempt
        transactionData.failed_attempts = (transactionData.failed_attempts || 0) + 1;
        
        if (transactionData.failed_attempts >= 3) {
          this.emit('need_escalation', {
            message: 'Too many failed OTP attempts. Transaction locked for security. Contact support.',
            escalation_type: 'OTP_FAILED_ATTEMPTS',
            transaction_id: this.data.transaction_id
          });
          return;
        }

        this.emit('error', {
          message: `Invalid OTP. ${3 - transactionData.failed_attempts} attempts remaining.`,
          field: 'otp'
        });
        return;
      }

      // Transaction approved
      this.result = {
        status: 'success',
        transaction_id: this.data.transaction_id,
        verification_status: 'APPROVED',
        message: `Transaction verified and approved. Amount: ${transactionData.amount}. ` +
                 `Recipient: ${transactionData.recipient}. Reference: ${transactionData.reference}`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Fintech] Transaction verified', { 
        callId: this.callId,
        transaction_id: this.data.transaction_id
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Fintech] Transaction verification error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      transaction_id: 'What is your transaction ID?',
      otp: 'Please enter the OTP sent to your registered phone number.'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getTransactionDetails(transactionId) {
    // Mock data - in production would query transaction database
    return {
      transaction_id: transactionId,
      amount: '$500.00',
      recipient: 'John Doe',
      reference: 'INV-2024-001',
      timestamp: new Date(),
      sent_otp: '123456',
      otp_expiry: 300, // 5 minutes
      failed_attempts: 0
    };
  }

  verifyOTP(enteredOTP, sentOTP) {
    // In production, would validate against time-based or server-stored OTP
    return enteredOTP === sentOTP;
  }
}

/**
 * FraudReportAgent
 * Handles fraud reporting and investigation initiation
 */
class FraudReportAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['fraud_type', 'transaction_id'];
    this.sector = 'fintech';
    this.agentType = 'REPORT_FRAUD';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🚨 [Fintech] Processing fraud report', { 
        callId: this.callId,
        fraud_type: this.data.fraud_type
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Validate fraud type
      if (!this.isValidFraudType(this.data.fraud_type)) {
        this.emit('error', {
          message: 'Invalid fraud type. Valid types: unauthorized_transaction, card_compromise, identity_theft.',
          field: 'fraud_type'
        });
        return;
      }

      // Create fraud investigation case
      this.result = {
        status: 'success',
        fraud_case_id: `FRAUD_${Date.now()}`,
        fraud_type: this.data.fraud_type,
        transaction_id: this.data.transaction_id,
        investigation_status: 'INITIATED',
        escalation_level: this.getEscalationLevel(this.data.fraud_type),
        message: `Fraud report received and investigation initiated. ` +
                 `Case ID: ${this.result?.fraud_case_id}. ` +
                 `Our team will investigate and contact you within 24 hours.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Fintech] Fraud case created', { 
        callId: this.callId,
        fraud_case_id: this.result.fraud_case_id
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Fintech] Fraud report error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      fraud_type: 'What type of fraud are you reporting? (unauthorized_transaction, card_compromise, identity_theft)',
      transaction_id: 'What is the transaction ID related to this fraud?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isValidFraudType(type) {
    const validTypes = ['unauthorized_transaction', 'card_compromise', 'identity_theft', 'phishing'];
    return validTypes.includes(type.toLowerCase());
  }

  getEscalationLevel(fraudType) {
    const escalationMap = {
      'unauthorized_transaction': 'MEDIUM',
      'card_compromise': 'HIGH',
      'identity_theft': 'CRITICAL',
      'phishing': 'MEDIUM'
    };
    return escalationMap[fraudType.toLowerCase()] || 'MEDIUM';
  }
}

module.exports = {
  BalanceCheckAgent,
  TransactionVerifyAgent,
  FraudReportAgent
};
