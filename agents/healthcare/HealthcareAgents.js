// Backend/agents/healthcare/HealthcareAgents.js
// ✅ PHASE 3: Healthcare sector specialized agents

const BaseAgent = require('../BaseAgent');
const resolve = require('../../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

/**
 * AppointmentBookingAgent
 * Handles appointment scheduling and booking for healthcare providers
 */
class AppointmentBookingAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['patient_name', 'preferred_time'];
    this.sector = 'healthcare';
    this.agentType = 'APPOINTMENT_BOOKING';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🏥 [Healthcare] Starting appointment booking', { 
        callId: this.callId,
        data: this.data
      });

      // Check required fields
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Validate appointment time
      if (!this.isValidAppointmentTime(this.data.preferred_time)) {
        this.emit('error', {
          message: 'Invalid appointment time. Please provide time between 9 AM - 6 PM.',
          field: 'preferred_time'
        });
        return;
      }

      // Simulate booking (in production, would integrate with calendar API)
      this.result = {
        status: 'success',
        appointment_id: `APPT_${Date.now()}`,
        patient_name: this.data.patient_name,
        appointment_time: this.data.preferred_time,
        confirmation_message: `Appointment confirmed for ${this.data.patient_name} at ${this.data.preferred_time}. Your appointment ID is ${this.result?.appointment_id || 'APPT_XXX'}.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Healthcare] Appointment booked', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Healthcare] Appointment booking error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      patient_name: 'What is your name?',
      preferred_time: 'When would you like to schedule your appointment? (e.g., 2 PM tomorrow)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isValidAppointmentTime(timeStr) {
    // Simple validation - in production, would check against actual calendar
    return timeStr && timeStr.length > 0;
  }
}

/**
 * PrescriptionRefillAgent
 * Handles prescription refill requests and validation
 */
class PrescriptionRefillAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['patient_id', 'prescription_id'];
    this.sector = 'healthcare';
    this.agentType = 'PRESCRIPTION_REFILL';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('💊 [Healthcare] Processing prescription refill', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Check prescription validity (in production, would query pharmacy DB)
      if (!this.isPrescriptionValid(this.data.prescription_id)) {
        this.emit('error', {
          message: 'Prescription not found or has expired.',
          field: 'prescription_id'
        });
        return;
      }

      // Check refill eligibility
      const refillsRemaining = this.getRefillsRemaining(this.data.prescription_id);
      if (refillsRemaining <= 0) {
        this.emit('need_escalation', {
          message: 'No refills remaining. Please contact your doctor.',
          reason: 'NO_REFILLS'
        });
        return;
      }

      this.result = {
        status: 'success',
        refill_id: `RX_${Date.now()}`,
        patient_id: this.data.patient_id,
        prescription_id: this.data.prescription_id,
        refills_remaining: refillsRemaining - 1,
        message: `Prescription refill approved. ${refillsRemaining - 1} refills remaining. Ready for pickup in 2 hours.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Healthcare] Prescription refilled', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Healthcare] Prescription refill error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      patient_id: 'What is your patient ID or date of birth?',
      prescription_id: 'What is your prescription number?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isPrescriptionValid(prescriptionId) {
    // In production, would query pharmacy database
    return prescriptionId && prescriptionId.length > 0;
  }

  getRefillsRemaining(prescriptionId) {
    // Mock data - in production would query database
    return 3;
  }
}

/**
 * TriageAgent
 * Performs medical triage and severity assessment
 */
class TriageAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['symptoms'];
    this.sector = 'healthcare';
    this.agentType = 'TRIAGE';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📋 [Healthcare] Starting triage assessment', { 
        callId: this.callId,
        symptoms: this.data.symptoms
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Assess severity
      const severity = this.assessSeverity(this.data.symptoms);
      
      // If urgent, escalate
      if (severity === 'CRITICAL' || severity === 'HIGH') {
        this.emit('need_escalation', {
          message: 'This requires immediate medical attention.',
          reason: 'URGENT_SYMPTOMS',
          severity
        });
        return;
      }

      // Provide guidance for low/medium severity
      const recommendation = this.getRecommendation(severity);

      this.result = {
        status: 'success',
        severity,
        symptoms: this.data.symptoms,
        recommendation,
        message: `Based on your symptoms, we recommend ${recommendation.action}. ${recommendation.details}`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Healthcare] Triage complete', { 
        callId: this.callId,
        severity,
        recommendation
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Healthcare] Triage error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      symptoms: 'Can you describe your symptoms?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  assessSeverity(symptoms) {
    // Simple keyword-based severity assessment
    const urgent = ['chest pain', 'difficulty breathing', 'unconscious', 'severe bleeding'];
    const high = ['fever', 'persistent vomiting', 'severe pain', 'unable to move'];

    const symptomsLower = symptoms.toLowerCase();
    
    if (urgent.some(s => symptomsLower.includes(s))) {
      return 'CRITICAL';
    }
    if (high.some(s => symptomsLower.includes(s))) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }

  getRecommendation(severity) {
    const recommendations = {
      CRITICAL: {
        action: 'calling 911 immediately',
        details: 'Please hang up and call emergency services or go to the nearest emergency room.'
      },
      HIGH: {
        action: 'seeing a doctor today',
        details: 'Please schedule an urgent appointment or visit an urgent care center.'
      },
      MEDIUM: {
        action: 'scheduling an appointment',
        details: 'Your symptoms suggest a visit to your primary care doctor within 24-48 hours.'
      }
    };

    return recommendations[severity] || recommendations.MEDIUM;
  }
}

/**
 * FollowUpAgent
 * Sends appointment reminders and follow-up care instructions
 */
class FollowUpAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['patient_phone', 'appointment_date'];
    this.sector = 'healthcare';
    this.agentType = 'FOLLOW_UP';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📞 [Healthcare] Sending follow-up', { 
        callId: this.callId,
        patient: this.data.patient_phone
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Schedule reminder (in production, would integrate with SMS/Email service)
      const reminderTime = this.calculateReminderTime(this.data.appointment_date);

      this.result = {
        status: 'success',
        reminder_id: `REMINDER_${Date.now()}`,
        patient_phone: this.data.patient_phone,
        appointment_date: this.data.appointment_date,
        reminder_time: reminderTime,
        message: `Reminder scheduled for ${reminderTime}. You will receive an SMS reminder for your appointment.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Healthcare] Follow-up scheduled', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Healthcare] Follow-up error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      patient_phone: 'What is your phone number for the reminder?',
      appointment_date: 'When is your appointment scheduled?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  calculateReminderTime(appointmentDate) {
    // Send reminder 24 hours before appointment
    return 'tomorrow at this time';
  }
}

/**
 * PatientInfoAgent
 * Provides general patient health information and FAQs
 */
class PatientInfoAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['query'];
    this.sector = 'healthcare';
    this.agentType = 'PATIENT_INFO';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('ℹ️  [Healthcare] Providing patient info', { 
        callId: this.callId,
        query: this.data.query
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Search knowledge base (in production, would query medical DB)
      const answer = this.getAnswer(this.data.query);

      this.result = {
        status: 'success',
        query: this.data.query,
        answer,
        message: answer
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Healthcare] Patient info provided', { 
        callId: this.callId,
        query: this.data.query
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Healthcare] Patient info error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      query: 'What health information can I help you with?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getAnswer(query) {
    // Mock knowledge base - in production would query real medical database
    const faq = {
      'hours': 'Our clinic is open Monday-Friday 9 AM to 6 PM, Saturday 10 AM to 2 PM.',
      'location': 'We are located at 123 Health Street, Medical Center Building.',
      'insurance': 'We accept most major insurance plans. Please bring your insurance card.',
      'forms': 'New patient forms are available on our website or can be completed in person.'
    };

    for (const [key, value] of Object.entries(faq)) {
      if (query.toLowerCase().includes(key)) {
        return value;
      }
    }

    return 'For more detailed information, please contact the clinic directly or speak with a healthcare provider.';
  }
}

module.exports = {
  AppointmentBookingAgent,
  PrescriptionRefillAgent,
  TriageAgent,
  FollowUpAgent,
  PatientInfoAgent
};
