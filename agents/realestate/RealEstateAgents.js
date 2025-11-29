// Backend/agents/realestate/RealEstateAgents.js
// ✅ PHASE 3: Real Estate sector specialized agents

const BaseAgent = require('../BaseAgent');
const resolve = require('../../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

/**
 * PropertyInquiryAgent
 * Handles inquiries about property details and specifications
 */
class PropertyInquiryAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['property_id'];
    this.sector = 'realestate';
    this.agentType = 'PROPERTY_INQUIRY';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🏠 [RealEstate] Handling property inquiry', { 
        callId: this.callId,
        property_id: this.data.property_id
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Fetch property details (in production, would query listing DB)
      const propertyDetails = this.getPropertyDetails(this.data.property_id);

      if (!propertyDetails) {
        this.emit('error', {
          message: 'Property not found.',
          field: 'property_id'
        });
        return;
      }

      // Format property information
      const propertyInfo = this.formatPropertyInfo(propertyDetails);

      this.result = {
        status: 'success',
        property_id: this.data.property_id,
        details: propertyDetails,
        message: propertyInfo
      };

      this.state = 'COMPLETED';
      logger.info('✅ [RealEstate] Property details provided', { 
        callId: this.callId,
        property_id: this.data.property_id
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [RealEstate] Property inquiry error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      property_id: 'What is the property ID or address you are interested in?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getPropertyDetails(propertyId) {
    // Mock data - in production would query MLS/listing database
    return {
      property_id: propertyId,
      address: '123 Oak Street, Springfield',
      price: '$450,000',
      bedrooms: 3,
      bathrooms: 2,
      sqft: 2100,
      lot_size: 0.25,
      type: 'Single Family',
      status: 'Active'
    };
  }

  formatPropertyInfo(details) {
    return `${details.bedrooms} bed, ${details.bathrooms} bath property at ${details.address}. ` +
           `${details.sqft} sq ft on ${details.lot_size} acre lot. Listed at ${details.price}. ` +
           `Would you like to schedule a showing?`;
  }
}

/**
 * ShowingScheduleAgent
 * Schedules property viewings and tours
 */
class ShowingScheduleAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['property_id', 'preferred_time', 'buyer_name'];
    this.sector = 'realestate';
    this.agentType = 'SCHEDULE_SHOWING';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📅 [RealEstate] Scheduling property showing', { 
        callId: this.callId,
        property_id: this.data.property_id
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Check availability (in production, would check calendar)
      if (!this.isTimeAvailable(this.data.preferred_time)) {
        this.emit('need_info', {
          message: 'That time is not available. Available times: 10 AM, 2 PM, 4 PM',
          field: 'preferred_time'
        });
        return;
      }

      this.result = {
        status: 'success',
        showing_id: `SHOWING_${Date.now()}`,
        property_id: this.data.property_id,
        buyer_name: this.data.buyer_name,
        showing_time: this.data.preferred_time,
        duration_mins: 30,
        message: `Showing confirmed for ${this.data.buyer_name} at ${this.data.preferred_time}. ` +
                 `Showing ID: ${this.result?.showing_id}. Agent will meet you at the property.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [RealEstate] Showing scheduled', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [RealEstate] Showing schedule error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      property_id: 'Which property would you like to see?',
      preferred_time: 'What time would you prefer for the showing?',
      buyer_name: 'What is your name?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isTimeAvailable(timeStr) {
    // In production, would check actual calendar
    return timeStr && timeStr.length > 0;
  }
}

/**
 * LeadCaptureAgent
 * Captures buyer/renter lead information for follow-up
 */
class LeadCaptureAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['buyer_name', 'buyer_phone', 'property_interest'];
    this.sector = 'realestate';
    this.agentType = 'LEAD_CAPTURE';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('👥 [RealEstate] Capturing lead information', { 
        callId: this.callId
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Validate contact information
      if (!this.isValidPhone(this.data.buyer_phone)) {
        this.emit('error', {
          message: 'Invalid phone number. Please provide a valid contact number.',
          field: 'buyer_phone'
        });
        return;
      }

      // Save lead (in production, would save to CRM)
      this.result = {
        status: 'success',
        lead_id: `LEAD_${Date.now()}`,
        buyer_name: this.data.buyer_name,
        buyer_phone: this.data.buyer_phone,
        property_interest: this.data.property_interest,
        lead_source: 'PHONE_AI',
        message: `Thank you, ${this.data.buyer_name}! We have captured your interest in ${this.data.property_interest}. ` +
                 `Our team will follow up with you shortly at ${this.data.buyer_phone}.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [RealEstate] Lead captured', { 
        callId: this.callId,
        lead_id: this.result.lead_id
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [RealEstate] Lead capture error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      buyer_name: 'What is your name?',
      buyer_phone: 'What is your contact phone number?',
      property_interest: 'Which property or area are you interested in?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isValidPhone(phone) {
    // Basic phone validation
    return /^\+?[\d\s\-()]{10,}$/.test(phone);
  }
}

/**
 * OfferStatusAgent
 * Tracks and provides updates on offer status
 */
class OfferStatusAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['offer_id'];
    this.sector = 'realestate';
    this.agentType = 'OFFER_STATUS';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📊 [RealEstate] Checking offer status', { 
        callId: this.callId,
        offer_id: this.data.offer_id
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Fetch offer status (in production, would query transaction DB)
      const offerStatus = this.getOfferStatus(this.data.offer_id);

      if (!offerStatus) {
        this.emit('error', {
          message: 'Offer not found.',
          field: 'offer_id'
        });
        return;
      }

      // Format status message
      const statusMessage = this.formatStatusMessage(offerStatus);

      this.result = {
        status: 'success',
        offer_id: this.data.offer_id,
        offer_status: offerStatus.status,
        message: statusMessage
      };

      this.state = 'COMPLETED';
      logger.info('✅ [RealEstate] Offer status provided', { 
        callId: this.callId,
        offer_status: offerStatus.status
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [RealEstate] Offer status error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      offer_id: 'What is your offer ID?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getOfferStatus(offerId) {
    // Mock data - in production would query transaction database
    return {
      offer_id: offerId,
      status: 'PENDING_INSPECTION',
      property: '123 Oak Street',
      offered_price: '$445,000',
      last_update: 'Awaiting home inspection results'
    };
  }

  formatStatusMessage(status) {
    return `Your offer for ${status.property} at ${status.offered_price} is currently ${status.status}. ` +
           `Last update: ${status.last_update}`;
  }
}

module.exports = {
  PropertyInquiryAgent,
  ShowingScheduleAgent,
  LeadCaptureAgent,
  OfferStatusAgent
};
