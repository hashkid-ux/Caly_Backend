// Backend/agents/government/GovernmentAgents.js
// ✅ PHASE 4: Government/Public Services sector specialized agents

const BaseAgent = require('../BaseAgent');
const resolve = require('../../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

/**
 * CitizenRoutingAgent
 * Routes citizen inquiries to appropriate government department
 */
class CitizenRoutingAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['inquiry_type', 'location'];
    this.sector = 'government';
    this.agentType = 'CITIZEN_ROUTING';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🏛️ [Government] Routing citizen inquiry', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Determine appropriate department
      const department = this.routeToDepart(this.data.inquiry_type, this.data.location);

      if (!department) {
        this.emit('error', {
          message: 'Unable to route your inquiry. Please try again with different details.',
          field: 'inquiry_type'
        });
        return;
      }

      this.result = {
        status: 'routed',
        inquiry_type: this.data.inquiry_type,
        location: this.data.location,
        department: department.name,
        department_phone: department.phone,
        department_email: department.email,
        office_hours: department.hours,
        reference_number: `REF_${Date.now()}`,
        message: `Your inquiry has been routed to the ${department.name}. They will contact you within the next 2-3 business days.`,
        online_portal: department.portal
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Government] Inquiry routed', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Government] Routing error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      inquiry_type: 'What is your inquiry about? (Permits, Licenses, Taxes, Benefits, Registration, Documentation)',
      location: 'Which city or county? (e.g., New York City, Los Angeles County)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  routeToDepart(inquiryType, location) {
    const departments = {
      'PERMITS': {
        name: 'Building & Zoning Department',
        phone: '311',
        email: 'permits@government.gov',
        hours: 'Monday-Friday 9 AM - 5 PM',
        portal: 'permits.government.gov'
      },
      'LICENSES': {
        name: 'Business Licensing Department',
        phone: '(555) 123-4567',
        email: 'licensing@government.gov',
        hours: 'Monday-Friday 8 AM - 4 PM',
        portal: 'licenses.government.gov'
      },
      'TAXES': {
        name: 'Tax Assessor\'s Office',
        phone: '(555) 234-5678',
        email: 'taxes@government.gov',
        hours: 'Monday-Friday 9 AM - 5 PM',
        portal: 'taxes.government.gov'
      },
      'BENEFITS': {
        name: 'Social Services Department',
        phone: '(555) 345-6789',
        email: 'benefits@government.gov',
        hours: 'Monday-Friday 8 AM - 5 PM, Saturday 10 AM - 2 PM',
        portal: 'benefits.government.gov'
      },
      'REGISTRATION': {
        name: 'Department of Records',
        phone: '(555) 456-7890',
        email: 'records@government.gov',
        hours: 'Monday-Friday 9 AM - 4 PM',
        portal: 'records.government.gov'
      },
      'DOCUMENTATION': {
        name: 'Vital Records Department',
        phone: '(555) 567-8901',
        email: 'vitals@government.gov',
        hours: 'Monday-Friday 8 AM - 5 PM',
        portal: 'vitals.government.gov'
      }
    };

    const lowerType = inquiryType.toUpperCase();
    return departments[lowerType] || null;
  }
}

/**
 * ComplaintIntakeAgent
 * Collects and documents citizen complaints
 */
class ComplaintIntakeAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['complaint_category', 'complaint_description', 'citizen_email'];
    this.sector = 'government';
    this.agentType = 'COMPLAINT_INTAKE';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📋 [Government] Intake complaint', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Validate email
      if (!this.isValidEmail(this.data.citizen_email)) {
        this.emit('error', {
          message: 'Please provide a valid email address.',
          field: 'citizen_email'
        });
        return;
      }

      // Validate complaint category
      if (!this.isValidCategory(this.data.complaint_category)) {
        this.emit('error', {
          message: 'Please select a valid complaint category.',
          field: 'complaint_category'
        });
        return;
      }

      const complaintId = `CMP_${Date.now()}`;

      this.result = {
        status: 'recorded',
        complaint_id: complaintId,
        complaint_category: this.data.complaint_category,
        complaint_description: this.data.complaint_description,
        citizen_email: this.data.citizen_email,
        submitted_at: new Date().toISOString(),
        estimated_review_time: '5-7 business days',
        confirmation_message: `Your complaint has been recorded with ID ${complaintId}. You will receive a confirmation email and status updates.`,
        reference_url: `https://complaints.government.gov/status/${complaintId}`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Government] Complaint recorded', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Government] Complaint intake error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      complaint_category: 'What is your complaint about? (Service Issue, Misconduct, Billing, Other)',
      complaint_description: 'Please describe your complaint in detail.',
      citizen_email: 'What is your email address for follow-up?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidCategory(category) {
    const validCategories = ['SERVICE_ISSUE', 'MISCONDUCT', 'BILLING', 'OTHER'];
    return validCategories.includes(category.toUpperCase());
  }
}

/**
 * StatusUpdateAgent
 * Provides status updates on submitted applications or complaints
 */
class StatusUpdateAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['reference_id', 'id_type'];
    this.sector = 'government';
    this.agentType = 'STATUS_UPDATE';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📊 [Government] Retrieving status update', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Retrieve status from database
      const status = this.getApplicationStatus(this.data.reference_id, this.data.id_type);

      if (!status) {
        this.emit('error', {
          message: 'Reference ID not found. Please verify and try again.',
          field: 'reference_id'
        });
        return;
      }

      this.result = {
        status: status.current_status,
        reference_id: this.data.reference_id,
        id_type: this.data.id_type,
        submitted_date: status.submitted_date,
        current_step: status.current_step,
        completion_percentage: status.completion_percentage,
        estimated_completion: status.estimated_completion,
        last_updated: new Date().toISOString(),
        message: `Your ${this.data.id_type} is currently ${status.current_status}. ${status.details}`,
        contact_info: 'For more information, call 311 or visit our office.'
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Government] Status retrieved', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Government] Status update error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      reference_id: 'What is your application or complaint reference ID?',
      id_type: 'What type of application? (Permit, License, Benefit, Complaint, Registration)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getApplicationStatus(referenceId, idType) {
    // Mock application database
    const applications = {
      'REF_1001': {
        current_status: 'UNDER_REVIEW',
        submitted_date: '2024-01-10',
        current_step: 'Verification',
        completion_percentage: 45,
        estimated_completion: '2024-02-05',
        details: 'Your application is being verified. No further action is needed at this time.'
      },
      'REF_1002': {
        current_status: 'PENDING_DOCUMENTATION',
        submitted_date: '2024-01-12',
        current_step: 'Document Review',
        completion_percentage: 30,
        estimated_completion: '2024-02-10',
        details: 'We need additional documentation. Please upload the required files within 7 days.'
      },
      'CMP_1003': {
        current_status: 'IN_INVESTIGATION',
        submitted_date: '2024-01-15',
        current_step: 'Investigation',
        completion_percentage: 60,
        estimated_completion: '2024-02-15',
        details: 'Your complaint is being investigated. We will contact you once investigation is complete.'
      }
    };

    return applications[referenceId] || null;
  }
}

/**
 * PermitTrackingAgent
 * Tracks permit applications and approvals
 */
class PermitTrackingAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['permit_number', 'property_address'];
    this.sector = 'government';
    this.agentType = 'PERMIT_TRACKING';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🏗️ [Government] Tracking permit', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Look up permit details
      const permit = this.lookupPermit(this.data.permit_number, this.data.property_address);

      if (!permit) {
        this.emit('error', {
          message: 'Permit not found. Please verify the permit number and property address.',
          field: 'permit_number'
        });
        return;
      }

      this.result = {
        status: 'success',
        permit_number: this.data.permit_number,
        property_address: this.data.property_address,
        permit_type: permit.type,
        issue_date: permit.issue_date,
        expiration_date: permit.expiration_date,
        current_status: permit.status,
        contractor_name: permit.contractor,
        inspections_completed: permit.inspections_completed,
        inspections_required: permit.inspections_required,
        next_inspection: permit.next_inspection,
        message: `${permit.type} Permit ${this.data.permit_number} is ${permit.status}. ${permit.inspections_completed} of ${permit.inspections_required} inspections completed.`,
        inspection_schedule: permit.next_inspection ? `Next inspection scheduled for ${permit.next_inspection}` : 'All inspections completed. Awaiting final approval.'
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Government] Permit tracked', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Government] Permit tracking error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      permit_number: 'What is your permit number?',
      property_address: 'What is the property address for this permit?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  lookupPermit(permitNumber, propertyAddress) {
    // Mock permit database
    const permits = {
      'PERM_2024001': {
        type: 'Building',
        issue_date: '2024-01-05',
        expiration_date: '2024-07-05',
        status: 'ACTIVE',
        contractor: 'ABC Construction Co.',
        inspections_completed: 2,
        inspections_required: 4,
        next_inspection: '2024-02-15'
      },
      'PERM_2024002': {
        type: 'Electrical',
        issue_date: '2024-01-08',
        expiration_date: '2024-06-08',
        status: 'PENDING_INSPECTION',
        contractor: 'XYZ Electric LLC',
        inspections_completed: 1,
        inspections_required: 2,
        next_inspection: '2024-02-05'
      },
      'PERM_2024003': {
        type: 'Plumbing',
        issue_date: '2024-01-12',
        expiration_date: '2024-04-12',
        status: 'APPROVED',
        contractor: 'Pro Plumbing Services',
        inspections_completed: 3,
        inspections_required: 3,
        next_inspection: null
      }
    };

    return permits[permitNumber] || null;
  }
}

module.exports = {
  CitizenRoutingAgent,
  ComplaintIntakeAgent,
  StatusUpdateAgent,
  PermitTrackingAgent
};
