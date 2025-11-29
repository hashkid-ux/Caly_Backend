// Backend/agents/telecom/TelecomAgents.js
// ✅ PHASE 4: Telecom/Utilities sector specialized agents

const BaseAgent = require('../BaseAgent');
const resolve = require('../../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

/**
 * OutageNotificationAgent
 * Provides real-time updates on service outages in customer's area
 */
class OutageNotificationAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['service_type', 'location_zip'];
    this.sector = 'telecom';
    this.agentType = 'OUTAGE_NOTIFICATION';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('⚡ [Telecom] Checking outage status', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Check for active outages in area
      const outage = this.checkOutageStatus(this.data.location_zip, this.data.service_type);

      if (outage.hasOutage) {
        this.result = {
          status: 'outage_active',
          service_type: this.data.service_type,
          location_zip: this.data.location_zip,
          outage_start: outage.startTime,
          estimated_restoration: outage.estimatedRestoration,
          affected_areas: outage.affectedAreas,
          customer_impact_count: outage.affectedCount,
          support_message: 'We\'re aware of this outage and are working to restore service. Thank you for your patience.',
          notification_channel: 'SMS sent to your registered phone number'
        };
      } else {
        this.result = {
          status: 'no_outage',
          service_type: this.data.service_type,
          location_zip: this.data.location_zip,
          message: 'No active outages reported in your area.',
          service_status: 'OPERATIONAL',
          last_checked: new Date().toISOString()
        };
      }

      this.state = 'COMPLETED';
      logger.info('✅ [Telecom] Outage check completed', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Telecom] Outage notification error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      service_type: 'What type of service? (Internet, Mobile, Phone, Electricity, Water, Gas)',
      location_zip: 'What is your ZIP code?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  checkOutageStatus(zipCode, serviceType) {
    // Mock outage database - in production would query real outage tracking system
    const activeOutages = [
      {
        zipCode: '90210',
        serviceType: 'Internet',
        startTime: '2024-01-15 14:30 UTC',
        estimatedRestoration: '2024-01-15 18:00 UTC',
        affectedAreas: ['Beverly Hills', 'West Hollywood'],
        affectedCount: 5234
      },
      {
        zipCode: '75001',
        serviceType: 'Mobile',
        startTime: '2024-01-15 15:45 UTC',
        estimatedRestoration: '2024-01-15 17:00 UTC',
        affectedAreas: ['Arlington', 'Grand Prairie'],
        affectedCount: 12500
      }
    ];

    const matchingOutage = activeOutages.find(o => o.zipCode === zipCode && o.serviceType === serviceType);
    
    return {
      hasOutage: !!matchingOutage,
      ...(matchingOutage || { startTime: null, estimatedRestoration: null, affectedAreas: [], affectedCount: 0 })
    };
  }
}

/**
 * BillingQueryAgent
 * Handles billing inquiries and bill explanations
 */
class BillingQueryAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['account_number', 'query_type'];
    this.sector = 'telecom';
    this.agentType = 'BILLING_QUERY';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('💰 [Telecom] Processing billing query', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Validate account number format
      if (!this.isValidAccountNumber(this.data.account_number)) {
        this.emit('error', {
          message: 'Invalid account number format. Please check and try again.',
          field: 'account_number'
        });
        return;
      }

      // Retrieve billing information
      const billInfo = this.getBillingInfo(this.data.account_number);

      if (!billInfo) {
        this.emit('error', {
          message: 'Account not found. Please verify your account number.',
          field: 'account_number'
        });
        return;
      }

      // Process query
      const response = this.processBillingQuery(this.data.query_type, billInfo);

      this.result = {
        status: 'success',
        account_number: this.data.account_number,
        query_type: this.data.query_type,
        billing_info: response,
        next_steps: 'Would you like to arrange a payment plan or have other questions?'
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Telecom] Billing query processed', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Telecom] Billing query error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      account_number: 'What is your account number? (10 digits on your bill)',
      query_type: 'What billing question do you have? (Current Balance, Payment History, Breakdown, Dispute)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isValidAccountNumber(accountNumber) {
    return /^\d{10}$/.test(accountNumber);
  }

  getBillingInfo(accountNumber) {
    // Mock billing database
    const accounts = {
      '5551234567': {
        customer_name: 'John Smith',
        current_balance: '$125.50',
        due_date: '2024-02-05',
        last_payment: '$89.99',
        last_payment_date: '2024-01-15',
        monthly_charges: [
          { description: 'Internet Service', amount: '$79.99' },
          { description: 'Mobile Plan', amount: '$45.99' },
          { description: 'Equipment Rental', amount: '$10.00' }
        ]
      },
      '5559876543': {
        customer_name: 'Jane Doe',
        current_balance: '$0.00',
        due_date: '2024-02-10',
        last_payment: '$156.87',
        last_payment_date: '2024-01-20',
        monthly_charges: [
          { description: 'Electricity', amount: '$145.32' },
          { description: 'Gas', amount: '$35.20' }
        ]
      }
    };

    return accounts[accountNumber] || null;
  }

  processBillingQuery(queryType, billInfo) {
    const responses = {
      'CURRENT_BALANCE': {
        current_balance: billInfo.current_balance,
        due_date: billInfo.due_date,
        message: `Your current balance is ${billInfo.current_balance}. Payment is due by ${billInfo.due_date}.`
      },
      'PAYMENT_HISTORY': {
        last_payment: billInfo.last_payment,
        last_payment_date: billInfo.last_payment_date,
        message: `Your last payment of ${billInfo.last_payment} was received on ${billInfo.last_payment_date}.`
      },
      'BREAKDOWN': {
        monthly_charges: billInfo.monthly_charges,
        total: billInfo.current_balance,
        message: 'Here\'s a breakdown of your charges.'
      },
      'DISPUTE': {
        message: 'To dispute a charge, please provide details about the charge you\'re questioning.',
        next_step: 'A billing specialist will contact you to investigate.'
      }
    };

    return responses[queryType] || responses['CURRENT_BALANCE'];
  }
}

/**
 * ServiceActivationAgent
 * Handles new service activation and plan upgrades
 */
class ServiceActivationAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['customer_name', 'service_type', 'plan_type'];
    this.sector = 'telecom';
    this.agentType = 'SERVICE_ACTIVATION';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📱 [Telecom] Activating service', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Validate service and plan availability
      const serviceDetails = this.getServiceDetails(this.data.service_type, this.data.plan_type);
      
      if (!serviceDetails) {
        this.emit('error', {
          message: 'Selected service or plan is not available.',
          field: 'plan_type'
        });
        return;
      }

      const activationId = `ACTV_${Date.now()}`;

      this.result = {
        status: 'activated',
        activation_id: activationId,
        customer_name: this.data.customer_name,
        service_type: this.data.service_type,
        plan_type: this.data.plan_type,
        monthly_cost: serviceDetails.monthly_cost,
        activation_fee: serviceDetails.activation_fee,
        activation_time: new Date().toISOString(),
        service_availability: '24-48 hours',
        setup_instructions: serviceDetails.setup_instructions,
        confirmation_message: `Service activated! Your ${this.data.service_type} service will be active within 24-48 hours.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Telecom] Service activated', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Telecom] Service activation error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      customer_name: 'What is your name?',
      service_type: 'What service would you like to activate? (Internet, Mobile, Phone, Electricity, Gas, Water)',
      plan_type: 'Which plan? (Basic, Standard, Premium, Unlimited)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getServiceDetails(serviceType, planType) {
    const services = {
      'Internet': {
        'Basic': { monthly_cost: '$49.99', activation_fee: '$99', setup_instructions: 'Modem will be shipped within 2 days.' },
        'Standard': { monthly_cost: '$79.99', activation_fee: '$99', setup_instructions: 'Professional installation included.' },
        'Premium': { monthly_cost: '$129.99', activation_fee: '$0', setup_instructions: 'Same-day professional installation.' }
      },
      'Mobile': {
        'Basic': { monthly_cost: '$39.99', activation_fee: '$50', setup_instructions: 'SIM card will be sent to you.' },
        'Standard': { monthly_cost: '$59.99', activation_fee: '$35', setup_instructions: 'Phone and SIM card included.' },
        'Unlimited': { monthly_cost: '$89.99', activation_fee: '$0', setup_instructions: 'Unlimited plan activated immediately.' }
      },
      'Electricity': {
        'Basic': { monthly_cost: '$85.00', activation_fee: '$0', setup_instructions: 'Connection within 5-7 business days.' },
        'Standard': { monthly_cost: '$120.00', activation_fee: '$150', setup_instructions: 'Smart meter installation included.' }
      }
    };

    return services[serviceType]?.[planType] || null;
  }
}

/**
 * AppointmentAgent
 * Schedules technician appointments for installation or maintenance
 */
class AppointmentAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['customer_name', 'service_type', 'preferred_date'];
    this.sector = 'telecom';
    this.agentType = 'APPOINTMENT';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📅 [Telecom] Scheduling appointment', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Check appointment availability
      if (!this.isDateAvailable(this.data.preferred_date)) {
        this.emit('error', {
          message: 'Selected date is not available. Please choose another date.',
          field: 'preferred_date'
        });
        return;
      }

      const appointmentId = `APT_${Date.now()}`;
      const timeSlot = this.assignTimeSlot(this.data.preferred_date);

      this.result = {
        status: 'scheduled',
        appointment_id: appointmentId,
        customer_name: this.data.customer_name,
        service_type: this.data.service_type,
        appointment_date: this.data.preferred_date,
        appointment_time: timeSlot,
        technician_window: '4-hour window',
        service_charge: 'Free',
        confirmation_message: `Appointment confirmed for ${this.data.customer_name} on ${this.data.preferred_date} between ${timeSlot}. A technician will arrive within the specified window.`,
        reminder: 'You will receive an SMS reminder 24 hours before the appointment.'
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Telecom] Appointment scheduled', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Telecom] Appointment error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      customer_name: 'What is your name?',
      service_type: 'What service requires an appointment? (Installation, Maintenance, Upgrade)',
      preferred_date: 'When would you prefer your appointment? (e.g., January 20, 2024)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isDateAvailable(date) {
    // Simple validation - in production would check actual availability calendar
    return date && date.length > 0;
  }

  assignTimeSlot(date) {
    // Mock time slot assignment - would query real scheduling system
    const timeSlots = ['8 AM - 12 PM', '12 PM - 4 PM', '4 PM - 8 PM'];
    return timeSlots[Math.floor(Math.random() * timeSlots.length)];
  }
}

module.exports = {
  OutageNotificationAgent,
  BillingQueryAgent,
  ServiceActivationAgent,
  AppointmentAgent
};
