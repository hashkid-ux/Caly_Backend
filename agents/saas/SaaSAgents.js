// Backend/agents/saas/SaaSAgents.js
// ✅ PHASE 4: SaaS/Software sector specialized agents

const BaseAgent = require('../BaseAgent');
const resolve = require('../../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

/**
 * OnboardingSupportAgent
 * Assists new users with product onboarding and initial setup
 */
class OnboardingSupportAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['user_id', 'onboarding_step'];
    this.sector = 'saas';
    this.agentType = 'ONBOARDING_SUPPORT';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🚀 [SaaS] Starting onboarding support', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Get onboarding guidance
      const guidance = this.getOnboardingGuidance(this.data.onboarding_step);

      if (!guidance) {
        this.emit('error', {
          message: 'Invalid onboarding step. Please try again.',
          field: 'onboarding_step'
        });
        return;
      }

      this.result = {
        status: 'guidance_provided',
        user_id: this.data.user_id,
        onboarding_step: this.data.onboarding_step,
        step_title: guidance.title,
        instructions: guidance.instructions,
        estimated_time: guidance.duration,
        next_step: guidance.next_step,
        resources: guidance.resources,
        video_tutorial: guidance.video_url,
        support_contact: 'onboarding@company.com',
        message: `Welcome! Let's get you started. ${guidance.title}: ${guidance.instructions}`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [SaaS] Onboarding guidance provided', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [SaaS] Onboarding support error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      user_id: 'What is your user ID or email address?',
      onboarding_step: 'Which step are you on? (Account Setup, Team Invitation, Integration, First Project, API Setup)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getOnboardingGuidance(step) {
    const guidance = {
      'ACCOUNT_SETUP': {
        title: 'Account Setup',
        instructions: '1. Verify your email 2. Set up your password 3. Configure timezone and language 4. Add profile picture',
        duration: '5 minutes',
        next_step: 'Team Invitation',
        resources: ['https://docs.company.com/setup', 'https://help.company.com/account-setup'],
        video_url: 'https://videos.company.com/setup'
      },
      'TEAM_INVITATION': {
        title: 'Team Invitation',
        instructions: '1. Go to Settings > Team 2. Click "Invite Team Members" 3. Enter email addresses 4. Assign roles 5. Send invitations',
        duration: '10 minutes',
        next_step: 'Integration',
        resources: ['https://docs.company.com/team-management', 'https://help.company.com/invitations'],
        video_url: 'https://videos.company.com/team-setup'
      },
      'INTEGRATION': {
        title: 'Integration',
        instructions: '1. Visit Integrations page 2. Browse available integrations 3. Connect your tools (Slack, GitHub, etc) 4. Test connection',
        duration: '15 minutes',
        next_step: 'First Project',
        resources: ['https://docs.company.com/integrations', 'https://api.company.com/integration-guide'],
        video_url: 'https://videos.company.com/integrations'
      },
      'FIRST_PROJECT': {
        title: 'Create Your First Project',
        instructions: '1. Click "New Project" 2. Name your project 3. Set project visibility 4. Add description 5. Invite team members',
        duration: '10 minutes',
        next_step: 'API Setup',
        resources: ['https://docs.company.com/projects', 'https://help.company.com/project-setup'],
        video_url: 'https://videos.company.com/first-project'
      },
      'API_SETUP': {
        title: 'API Setup',
        instructions: '1. Generate API key 2. Configure webhooks 3. Test API connection 4. Review rate limits 5. Implement in your app',
        duration: '20 minutes',
        next_step: 'Complete!',
        resources: ['https://api.company.com/docs', 'https://github.com/company/sdk-js'],
        video_url: 'https://videos.company.com/api-setup'
      }
    };

    return guidance[step.toUpperCase()] || null;
  }
}

/**
 * BillingQueryAgent
 * Handles billing inquiries and subscription management
 */
class BillingQueryAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['account_id', 'query_type'];
    this.sector = 'saas';
    this.agentType = 'BILLING_QUERY';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('💳 [SaaS] Processing billing query', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Get billing information
      const billingInfo = this.getBillingInfo(this.data.account_id);

      if (!billingInfo) {
        this.emit('error', {
          message: 'Account not found.',
          field: 'account_id'
        });
        return;
      }

      // Process query
      const response = this.processBillingQuery(this.data.query_type, billingInfo);

      this.result = {
        status: 'success',
        account_id: this.data.account_id,
        query_type: this.data.query_type,
        billing_info: response,
        payment_methods: billingInfo.payment_methods,
        next_billing_date: billingInfo.next_billing_date,
        upgrade_available: 'Consider upgrading for more features',
        contact: 'billing@company.com'
      };

      this.state = 'COMPLETED';
      logger.info('✅ [SaaS] Billing query processed', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [SaaS] Billing query error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      account_id: 'What is your account ID or email?',
      query_type: 'What billing question do you have? (Current Plan, Invoice, Upgrade, Refund, Discount)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getBillingInfo(accountId) {
    const accounts = {
      'ACC_001': {
        customer_name: 'Acme Corp',
        current_plan: 'Professional',
        monthly_cost: '$99/month',
        annual_cost: '$990/year',
        billing_cycle: 'Monthly',
        next_billing_date: '2024-02-15',
        payment_methods: ['Visa ending in 4242', 'PayPal: acme@corp.com'],
        seats_used: 15,
        seats_available: 50,
        features: ['Custom Integrations', 'Advanced Analytics', 'Priority Support'],
        renewal_date: '2024-02-15'
      },
      'ACC_002': {
        customer_name: 'Startup Inc',
        current_plan: 'Starter',
        monthly_cost: '$29/month',
        annual_cost: '$290/year',
        billing_cycle: 'Annual',
        next_billing_date: '2024-12-20',
        payment_methods: ['Visa ending in 1234'],
        seats_used: 3,
        seats_available: 5,
        features: ['Basic Integrations', 'Standard Support'],
        renewal_date: '2024-12-20'
      }
    };

    return accounts[accountId] || null;
  }

  processBillingQuery(queryType, billingInfo) {
    const responses = {
      'CURRENT_PLAN': {
        plan_name: billingInfo.current_plan,
        cost: billingInfo.monthly_cost,
        billing_cycle: billingInfo.billing_cycle,
        seats_available: `${billingInfo.seats_used}/${billingInfo.seats_available}`,
        features: billingInfo.features
      },
      'INVOICE': {
        message: 'Your latest invoice has been sent to your email.',
        download_link: 'https://billing.company.com/invoices/INV_001',
        amount: billingInfo.monthly_cost,
        date: billingInfo.next_billing_date
      },
      'UPGRADE': {
        available_plans: [
          { name: 'Professional', cost: '$99/month', features: '+Custom Integrations' },
          { name: 'Enterprise', cost: 'Custom', features: '+Dedicated Support' }
        ],
        message: 'Upgrade anytime to access more features.'
      },
      'REFUND': {
        message: 'Refund requests are processed within 5-7 business days.',
        policy: 'Full refund within 30 days of purchase or 14 days for monthly plans.'
      },
      'DISCOUNT': {
        message: 'Check if you qualify for annual billing discount (15% off) or non-profit rates.',
        annual_discount: '15% off with annual billing'
      }
    };

    return responses[queryType] || responses['CURRENT_PLAN'];
  }
}

/**
 * DemoSchedulingAgent
 * Schedules product demo calls with sales team
 */
class DemoSchedulingAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['prospect_name', 'prospect_email', 'preferred_time'];
    this.sector = 'saas';
    this.agentType = 'DEMO_SCHEDULING';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📅 [SaaS] Scheduling demo call', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Validate email
      if (!this.isValidEmail(this.data.prospect_email)) {
        this.emit('error', {
          message: 'Please provide a valid email address.',
          field: 'prospect_email'
        });
        return;
      }

      // Check availability
      const availableSlot = this.findAvailableSlot(this.data.preferred_time);

      if (!availableSlot) {
        this.emit('error', {
          message: 'Selected time is not available. Please choose another time.',
          field: 'preferred_time'
        });
        return;
      }

      const demoId = `DEMO_${Date.now()}`;

      this.result = {
        status: 'scheduled',
        demo_id: demoId,
        prospect_name: this.data.prospect_name,
        prospect_email: this.data.prospect_email,
        scheduled_time: availableSlot.time,
        duration: '30 minutes',
        demo_type: 'One-on-one walkthrough',
        join_link: 'https://meet.company.com/demo/' + demoId,
        confirmation_sent: true,
        demo_topics: [
          'Product Overview',
          'Your Use Case',
          'Integration with Your Tools',
          'Pricing & ROI',
          'Questions & Next Steps'
        ],
        confirmation_message: `Demo scheduled for ${availableSlot.time}. Check your email for the meeting link and dial-in details.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [SaaS] Demo scheduled', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [SaaS] Demo scheduling error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      prospect_name: 'What is your name?',
      prospect_email: 'What is your email address?',
      preferred_time: 'When would you prefer the demo? (e.g., Tomorrow 2 PM, Next Tuesday 10 AM)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  findAvailableSlot(preferredTime) {
    // Mock availability - in production would check real calendar
    const availableSlots = [
      { time: 'Tomorrow 10:00 AM', slot: 1 },
      { time: 'Tomorrow 2:00 PM', slot: 2 },
      { time: 'Tomorrow 4:00 PM', slot: 3 },
      { time: 'Next Tuesday 10:00 AM', slot: 4 },
      { time: 'Next Tuesday 2:00 PM', slot: 5 }
    ];

    // Try to match requested time
    const match = availableSlots.find(slot => 
      slot.time.toLowerCase().includes(preferredTime.toLowerCase())
    );

    return match || availableSlots[0];
  }
}

/**
 * FeatureFAQAgent
 * Answers questions about product features and capabilities
 */
class FeatureFAQAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['feature_question'];
    this.sector = 'saas';
    this.agentType = 'FEATURE_FAQ';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('❓ [SaaS] Answering feature question', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Search feature FAQ
      const answer = this.searchFeatureFAQ(this.data.feature_question);

      if (answer) {
        this.result = {
          status: 'answered',
          question: this.data.feature_question,
          answer: answer.description,
          use_cases: answer.use_cases,
          documentation: answer.doc_link,
          video_tutorial: answer.video_link,
          related_features: answer.related
        };

        this.state = 'COMPLETED';
        logger.info('✅ [SaaS] Feature question answered', { 
          callId: this.callId,
          result: this.result
        });

        this.emit('complete', this.result);
      } else {
        this.emit('need_escalation', {
          message: 'Your question about features requires expert guidance. Our product specialist will contact you.',
          question: this.data.feature_question,
          contact_team: 'Product Support'
        });
      }
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [SaaS] Feature FAQ error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      feature_question: 'What feature would you like to know about? (Automation, Reporting, Integrations, Security, etc.)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  searchFeatureFAQ(question) {
    const features = {
      'automation': {
        description: 'Automate repetitive tasks using workflows. Set triggers and actions to streamline processes.',
        use_cases: ['Auto-assign tickets', 'Send notifications', 'Update records automatically'],
        doc_link: 'https://docs.company.com/automation',
        video_link: 'https://videos.company.com/automation',
        related: ['Triggers', 'Actions', 'Scheduling']
      },
      'reporting': {
        description: 'Create custom reports and dashboards to track KPIs. Export data in multiple formats.',
        use_cases: ['Performance metrics', 'Team analytics', 'Customer insights'],
        doc_link: 'https://docs.company.com/reporting',
        video_link: 'https://videos.company.com/reporting',
        related: ['Dashboards', 'Charts', 'Data Export']
      },
      'integration': {
        description: 'Connect with 100+ tools like Slack, GitHub, Salesforce, Jira, and more.',
        use_cases: ['Sync data', 'Bi-directional updates', 'Centralized notifications'],
        doc_link: 'https://docs.company.com/integrations',
        video_link: 'https://videos.company.com/integrations',
        related: ['API', 'Webhooks', 'Custom Integrations']
      },
      'security': {
        description: 'Enterprise-grade security with SSO, 2FA, encryption, and compliance certifications.',
        use_cases: ['User authentication', 'Data protection', 'Audit logs'],
        doc_link: 'https://docs.company.com/security',
        video_link: 'https://videos.company.com/security',
        related: ['SSO', 'Encryption', 'Compliance']
      },
      'collaboration': {
        description: 'Real-time collaboration tools for teams. Comments, mentions, and activity streams.',
        use_cases: ['Team coordination', 'Project management', 'Communication'],
        doc_link: 'https://docs.company.com/collaboration',
        video_link: 'https://videos.company.com/collaboration',
        related: ['Comments', 'Mentions', 'Activity Feed']
      }
    };

    const lowerQuestion = question.toLowerCase();
    for (const [key, feature] of Object.entries(features)) {
      if (lowerQuestion.includes(key)) {
        return feature;
      }
    }

    return null;
  }
}

module.exports = {
  OnboardingSupportAgent,
  BillingQueryAgent,
  DemoSchedulingAgent,
  FeatureFAQAgent
};
