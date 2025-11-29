// Backend/agents/support/SupportAgents.js
// ✅ PHASE 4: Support/SaaS sector specialized agents

const BaseAgent = require('../BaseAgent');
const resolve = require('../../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

/**
 * L1SupportAgent
 * Handles initial customer support inquiries with FAQ matching and basic troubleshooting
 */
class L1SupportAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['issue_description'];
    this.sector = 'support';
    this.agentType = 'L1_SUPPORT';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🆘 [Support] Starting L1 support inquiry', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Try to match against FAQ database
      const faqMatch = this.searchFAQ(this.data.issue_description);
      
      if (faqMatch.found) {
        this.result = {
          status: 'resolved',
          support_level: 'L1',
          issue_type: faqMatch.category,
          solution: faqMatch.answer,
          satisfaction_survey: 'Was this helpful? Please reply Yes or No',
          ticket_id: `SUP_${Date.now()}`
        };

        this.state = 'COMPLETED';
        logger.info('✅ [Support] L1 issue resolved with FAQ', { 
          callId: this.callId,
          result: this.result
        });

        this.emit('complete', this.result);
      } else {
        // Issue requires escalation to L2
        this.state = 'WAITING_FOR_ESCALATION';
        this.emit('need_escalation', {
          message: 'Your issue requires specialized support. Creating ticket for L2 team...',
          reason: 'FAQ_NO_MATCH',
          issue_description: this.data.issue_description,
          support_level: 'L1',
          ticket_id: `SUP_${Date.now()}`
        });
      }
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Support] L1 support error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      issue_description: 'What issue are you experiencing? Please describe the problem you\'re facing.'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  searchFAQ(query) {
    const faq = {
      'password_reset': {
        category: 'ACCOUNT_ACCESS',
        answer: 'To reset your password, click "Forgot Password" on the login page. You\'ll receive an email with reset instructions.'
      },
      'billing_issue': {
        category: 'BILLING',
        answer: 'For billing inquiries, please check your account dashboard under "Billing History" or contact our billing team.'
      },
      'login_problem': {
        category: 'ACCOUNT_ACCESS',
        answer: 'If you can\'t log in, ensure caps lock is off, and verify your email address is correct. Try resetting your password.'
      },
      'feature_request': {
        category: 'GENERAL_INQUIRY',
        answer: 'Thank you for your suggestion! Please submit feature requests through our feedback portal for our product team to review.'
      },
      'data_export': {
        category: 'DATA_MANAGEMENT',
        answer: 'You can export your data from Settings > Data Export. Select your preferred format (CSV, JSON) and download.'
      },
      'integration': {
        category: 'TECHNICAL',
        answer: 'Our API documentation is available at docs.company.com. For integration help, check our integration guides or contact technical support.'
      }
    };

    const lowerQuery = query.toLowerCase();
    for (const [key, value] of Object.entries(faq)) {
      if (lowerQuery.includes(key)) {
        return { found: true, ...value };
      }
    }

    return { found: false };
  }
}

/**
 * TicketCreationAgent
 * Creates and manages support tickets with priority assignment
 */
class TicketCreationAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['customer_email', 'issue_title', 'priority'];
    this.sector = 'support';
    this.agentType = 'TICKET_CREATION';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🎫 [Support] Creating support ticket', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Validate email format
      if (!this.isValidEmail(this.data.customer_email)) {
        this.emit('error', {
          message: 'Please provide a valid email address.',
          field: 'customer_email'
        });
        return;
      }

      // Validate priority level
      if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(this.data.priority)) {
        this.emit('error', {
          message: 'Priority must be LOW, MEDIUM, HIGH, or CRITICAL.',
          field: 'priority'
        });
        return;
      }

      const ticketId = `TKT_${Date.now()}`;
      
      this.result = {
        status: 'created',
        ticket_id: ticketId,
        customer_email: this.data.customer_email,
        issue_title: this.data.issue_title,
        priority: this.data.priority,
        created_at: new Date().toISOString(),
        estimated_response: this.getEstimatedResponse(this.data.priority),
        confirmation_message: `Support ticket ${ticketId} created successfully. You will receive a confirmation email at ${this.data.customer_email}.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Support] Ticket created', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Support] Ticket creation error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      customer_email: 'What is your email address for this support ticket?',
      issue_title: 'Please provide a brief title for your issue.',
      priority: 'What is the priority level? (LOW, MEDIUM, HIGH, CRITICAL)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  getEstimatedResponse(priority) {
    const responses = {
      'CRITICAL': '15 minutes',
      'HIGH': '1 hour',
      'MEDIUM': '4 hours',
      'LOW': '24 hours'
    };
    return responses[priority] || '24 hours';
  }
}

/**
 * FAQLookupAgent
 * Searches and returns relevant FAQ articles for common issues
 */
class FAQLookupAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['search_query'];
    this.sector = 'support';
    this.agentType = 'FAQ_LOOKUP';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📚 [Support] Searching FAQ', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      const articles = this.searchFAQArticles(this.data.search_query);

      if (articles.length > 0) {
        this.result = {
          status: 'success',
          search_query: this.data.search_query,
          articles_found: articles.length,
          articles: articles,
          helpful_prompt: 'Did you find the answer you were looking for?'
        };

        this.state = 'COMPLETED';
        logger.info('✅ [Support] FAQ articles found', { 
          callId: this.callId,
          result: this.result
        });

        this.emit('complete', this.result);
      } else {
        this.result = {
          status: 'no_results',
          search_query: this.data.search_query,
          message: 'No FAQ articles found matching your search. Please create a support ticket for assistance.',
          next_action: 'Would you like to create a support ticket?'
        };

        this.state = 'COMPLETED';
        logger.info('⚠️ [Support] No FAQ articles found', { 
          callId: this.callId
        });

        this.emit('complete', this.result);
      }
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Support] FAQ lookup error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      search_query: 'What would you like help with? (e.g., "how to reset password", "billing issues")'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  searchFAQArticles(query) {
    const faqDatabase = [
      {
        id: 'faq_001',
        title: 'How to Reset Your Password',
        category: 'Account Access',
        keywords: ['password', 'reset', 'login', 'access'],
        content: 'To reset your password, click "Forgot Password" on the login page. Enter your email and follow the instructions sent to your inbox.'
      },
      {
        id: 'faq_002',
        title: 'Understanding Your Invoice',
        category: 'Billing',
        keywords: ['invoice', 'billing', 'charge', 'payment'],
        content: 'Your invoice is available in Settings > Billing History. It includes a breakdown of all charges and dates.'
      },
      {
        id: 'faq_003',
        title: 'API Documentation',
        category: 'Technical',
        keywords: ['api', 'integration', 'technical', 'developer'],
        content: 'Our API documentation is available at docs.company.com with code examples in Python, JavaScript, and more.'
      },
      {
        id: 'faq_004',
        title: 'Exporting Your Data',
        category: 'Data Management',
        keywords: ['export', 'data', 'download', 'backup'],
        content: 'Navigate to Settings > Data Export to download your data in CSV or JSON format.'
      },
      {
        id: 'faq_005',
        title: 'Two-Factor Authentication Setup',
        category: 'Security',
        keywords: ['2fa', 'authentication', 'security', 'two-factor'],
        content: 'Enable 2FA in Settings > Security. You can use an authenticator app or receive codes via SMS.'
      }
    ];

    const lowerQuery = query.toLowerCase();
    return faqDatabase.filter(article => 
      article.keywords.some(keyword => lowerQuery.includes(keyword))
    ).map(article => ({
      id: article.id,
      title: article.title,
      category: article.category,
      content: article.content
    }));
  }
}

/**
 * IssueEscalationAgent
 * Handles escalation of complex issues to specialized teams
 */
class IssueEscalationAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['ticket_id', 'escalation_reason'];
    this.sector = 'support';
    this.agentType = 'ISSUE_ESCALATION';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('⬆️ [Support] Escalating issue', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Determine escalation team based on reason
      const escalationTeam = this.getEscalationTeam(this.data.escalation_reason);
      
      this.result = {
        status: 'escalated',
        ticket_id: this.data.ticket_id,
        escalation_reason: this.data.escalation_reason,
        escalated_to: escalationTeam,
        escalated_at: new Date().toISOString(),
        priority: this.determinePriority(this.data.escalation_reason),
        sla_time: this.getSLATime(escalationTeam),
        message: `Your issue has been escalated to ${escalationTeam} team. A specialist will contact you shortly.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Support] Issue escalated', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Support] Escalation error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      ticket_id: 'Please provide your ticket ID (e.g., TKT_1234567890).',
      escalation_reason: 'Why does this issue need escalation? (e.g., "Account compromised", "Payment error", "Technical issue")'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getEscalationTeam(reason) {
    const teamMapping = {
      'account_compromised': 'Security',
      'payment_error': 'Billing',
      'technical_issue': 'Engineering',
      'data_loss': 'Data Recovery',
      'integration_problem': 'Technical Support',
      'fraud': 'Fraud Prevention'
    };

    const lowerReason = reason.toLowerCase();
    for (const [key, team] of Object.entries(teamMapping)) {
      if (lowerReason.includes(key)) {
        return team;
      }
    }

    return 'General Support';
  }

  determinePriority(reason) {
    const lowerReason = reason.toLowerCase();
    if (lowerReason.includes('compromised') || lowerReason.includes('fraud') || lowerReason.includes('critical')) {
      return 'CRITICAL';
    } else if (lowerReason.includes('error') || lowerReason.includes('issue')) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }

  getSLATime(team) {
    const slaMapping = {
      'Security': '30 minutes',
      'Billing': '2 hours',
      'Engineering': '4 hours',
      'Data Recovery': '2 hours',
      'Technical Support': '1 hour',
      'Fraud Prevention': '15 minutes'
    };
    return slaMapping[team] || '4 hours';
  }
}

module.exports = {
  L1SupportAgent,
  TicketCreationAgent,
  FAQLookupAgent,
  IssueEscalationAgent
};
