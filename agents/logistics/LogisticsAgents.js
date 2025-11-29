// Backend/agents/logistics/LogisticsAgents.js
// ✅ PHASE 3: Logistics sector specialized agents

const BaseAgent = require('../BaseAgent');
const resolve = require('../../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

/**
 * TrackingAgent
 * Provides real-time tracking information for parcels
 */
class TrackingAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['tracking_number'];
    this.sector = 'logistics';
    this.agentType = 'TRACK_PARCEL';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📦 [Logistics] Tracking parcel', { 
        callId: this.callId,
        tracking_number: this.data.tracking_number
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Get tracking information (in production, would query logistics DB)
      const trackingData = this.getTrackingData(this.data.tracking_number);

      if (!trackingData) {
        this.emit('error', {
          message: 'Tracking number not found in our system.',
          field: 'tracking_number'
        });
        return;
      }

      // Format tracking information
      const trackingMessage = this.formatTrackingMessage(trackingData);

      this.result = {
        status: 'success',
        tracking_number: this.data.tracking_number,
        current_status: trackingData.status,
        current_location: trackingData.location,
        estimated_delivery: trackingData.estimated_delivery,
        message: trackingMessage
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Logistics] Tracking information provided', { 
        callId: this.callId,
        tracking_number: this.data.tracking_number
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Logistics] Tracking error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      tracking_number: 'What is your tracking number?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getTrackingData(trackingNumber) {
    // Mock data - in production would query real-time tracking API
    return {
      tracking_number: trackingNumber,
      status: 'IN_TRANSIT',
      location: 'Distribution Center - Chicago, IL',
      last_update: '2 hours ago',
      estimated_delivery: 'Tomorrow by 6 PM',
      stops: [
        { location: 'Origin - New York', time: '1 day ago' },
        { location: 'Distribution Center - Chicago', time: '2 hours ago' }
      ]
    };
  }

  formatTrackingMessage(data) {
    return `Your package is ${data.status}. Current location: ${data.location}. ` +
           `Estimated delivery: ${data.estimated_delivery}. Last update: ${data.last_update}.`;
  }
}

/**
 * PickupScheduleAgent
 * Schedules package pickups from shipper locations
 */
class PickupScheduleAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['pickup_address', 'preferred_time', 'shipper_name'];
    this.sector = 'logistics';
    this.agentType = 'SCHEDULE_PICKUP';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🚚 [Logistics] Scheduling pickup', { 
        callId: this.callId,
        pickup_address: this.data.pickup_address
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Validate address format (in production, would geocode and validate)
      if (!this.isValidAddress(this.data.pickup_address)) {
        this.emit('error', {
          message: 'Address format unclear. Please provide street, city, and zip code.',
          field: 'pickup_address'
        });
        return;
      }

      // Check pickup availability (in production, would check delivery zone coverage)
      if (!this.isDeliveryZoneCovered(this.data.pickup_address)) {
        this.emit('need_escalation', {
          message: `We don't currently service ${this.data.pickup_address}. ` +
                   `Please provide an alternative pickup location or contact support.`,
          escalation_type: 'SERVICE_AREA'
        });
        return;
      }

      this.result = {
        status: 'success',
        pickup_id: `PICKUP_${Date.now()}`,
        pickup_address: this.data.pickup_address,
        shipper_name: this.data.shipper_name,
        scheduled_time: this.data.preferred_time,
        message: `Pickup confirmed for ${this.data.shipper_name} at ${this.data.pickup_address}. ` +
                 `Scheduled for ${this.data.preferred_time}. Pickup ID: ${this.result?.pickup_id}`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Logistics] Pickup scheduled', { 
        callId: this.callId,
        pickup_id: this.result.pickup_id
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Logistics] Pickup schedule error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      pickup_address: 'What is the pickup address?',
      preferred_time: 'What time would you prefer for the pickup?',
      shipper_name: 'What is your company name or name?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isValidAddress(address) {
    // Basic address validation
    return address && address.length > 5;
  }

  isDeliveryZoneCovered(address) {
    // In production, would check geocoding service
    return true;
  }
}

/**
 * DeliveryFailureAgent
 * Handles failed deliveries and schedules redelivery attempts
 */
class DeliveryFailureAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['tracking_number', 'delivery_address'];
    this.sector = 'logistics';
    this.agentType = 'HANDLE_DELIVERY_FAILURE';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('⚠️ [Logistics] Handling delivery failure', { 
        callId: this.callId,
        tracking_number: this.data.tracking_number
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Get current delivery attempt data
      const attemptData = this.getDeliveryAttempts(this.data.tracking_number);

      // Check if max attempts reached
      if (attemptData.attempts_count >= this.getMaxAttempts()) {
        this.emit('need_escalation', {
          message: `Maximum delivery attempts reached. Please contact customer support to arrange alternative delivery.`,
          escalation_type: 'MAX_ATTEMPTS_REACHED',
          tracking_number: this.data.tracking_number
        });
        return;
      }

      // Schedule redelivery
      this.result = {
        status: 'success',
        tracking_number: this.data.tracking_number,
        reattempt_number: attemptData.attempts_count + 1,
        scheduled_redelivery: this.scheduleNextDeliveryDate(),
        message: `Redelivery scheduled. Your package will be delivered on ` +
                 `${this.result?.scheduled_redelivery}. We will send you a notification.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Logistics] Redelivery scheduled', { 
        callId: this.callId,
        scheduled_redelivery: this.result.scheduled_redelivery
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Logistics] Delivery failure error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      tracking_number: 'What is your tracking number?',
      delivery_address: 'What is the delivery address?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getDeliveryAttempts(trackingNumber) {
    // Mock data - in production would query delivery attempt history
    return {
      tracking_number: trackingNumber,
      attempts_count: 1,
      last_attempt: '2 hours ago'
    };
  }

  getMaxAttempts() {
    return 3;
  }

  scheduleNextDeliveryDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toLocaleDateString();
  }
}

/**
 * AddressAgent
 * Clarifies and verifies delivery addresses
 */
class AddressAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['tracking_number', 'address_input'];
    this.sector = 'logistics';
    this.agentType = 'CLARIFY_ADDRESS';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🏠 [Logistics] Clarifying address', { 
        callId: this.callId,
        tracking_number: this.data.tracking_number
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Parse and validate address
      const addressParsed = this.parseAddress(this.data.address_input);

      if (!addressParsed.isValid) {
        // Request clarification on missing components
        const missingField = addressParsed.missingComponents[0];
        this.emit('need_info', {
          message: `Please clarify the ${missingField} for this delivery.`,
          field: 'address_input',
          missing_component: missingField
        });
        return;
      }

      // Format and confirm address
      const formattedAddress = this.formatAddress(addressParsed);

      this.result = {
        status: 'success',
        tracking_number: this.data.tracking_number,
        original_input: this.data.address_input,
        parsed_address: addressParsed,
        formatted_address: formattedAddress,
        message: `Address confirmed: ${formattedAddress}. ` +
                 `Your package will be delivered to this address.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Logistics] Address verified', { 
        callId: this.callId,
        formatted_address: formattedAddress
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Logistics] Address clarification error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      tracking_number: 'What is your tracking number?',
      address_input: 'What is the delivery address?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  parseAddress(addressStr) {
    // Basic address parsing
    const parts = addressStr.split(',').map(p => p.trim());
    
    return {
      street: parts[0] || null,
      city: parts[1] || null,
      state: parts[2] || null,
      zip: parts[3] || null,
      isValid: parts.length >= 3 && parts[0].length > 3,
      missingComponents: this.identifyMissingComponents(parts)
    };
  }

  identifyMissingComponents(parts) {
    const missing = [];
    if (!parts[0] || parts[0].length < 3) missing.push('street address');
    if (!parts[1]) missing.push('city');
    if (!parts[2]) missing.push('state');
    return missing;
  }

  formatAddress(parsed) {
    return `${parsed.street}, ${parsed.city}, ${parsed.state} ${parsed.zip || ''}`.trim();
  }
}

module.exports = {
  TrackingAgent,
  PickupScheduleAgent,
  DeliveryFailureAgent,
  AddressAgent
};
