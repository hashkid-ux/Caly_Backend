// Backend/agents/travel/TravelAgents.js
// ✅ PHASE 4: Travel/Hospitality sector specialized agents

const BaseAgent = require('../BaseAgent');
const resolve = require('../../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

/**
 * BookingConfirmationAgent
 * Provides booking confirmation details and payment options
 */
class BookingConfirmationAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['booking_reference', 'email'];
    this.sector = 'travel';
    this.agentType = 'BOOKING_CONFIRMATION';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('✈️ [Travel] Retrieving booking confirmation', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Verify email format
      if (!this.isValidEmail(this.data.email)) {
        this.emit('error', {
          message: 'Please provide a valid email address.',
          field: 'email'
        });
        return;
      }

      // Retrieve booking
      const booking = this.getBooking(this.data.booking_reference);

      if (!booking) {
        this.emit('error', {
          message: 'Booking not found. Please verify your booking reference.',
          field: 'booking_reference'
        });
        return;
      }

      this.result = {
        status: 'confirmed',
        booking_reference: this.data.booking_reference,
        property: booking.property,
        check_in: booking.check_in,
        check_out: booking.check_out,
        number_of_nights: booking.nights,
        total_guests: booking.guests,
        total_price: booking.total_price,
        payment_status: booking.payment_status,
        confirmation_number: booking.confirmation,
        cancellation_policy: booking.cancellation,
        check_in_instructions: booking.instructions,
        confirmation_message: `Your booking at ${booking.property} from ${booking.check_in} to ${booking.check_out} is confirmed. Confirmation sent to ${this.data.email}`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Travel] Booking confirmed', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Travel] Booking confirmation error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      booking_reference: 'What is your booking reference number? (e.g., BK123ABC)',
      email: 'What email address should we send the confirmation to?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  getBooking(bookingRef) {
    const bookings = {
      'BK123ABC': {
        property: 'Paradise Beach Resort',
        check_in: '2024-02-15',
        check_out: '2024-02-20',
        nights: 5,
        guests: 2,
        total_price: '$1,250',
        payment_status: 'PAID',
        confirmation: 'CONF_987654',
        cancellation: 'Free cancellation up to 48 hours before check-in',
        instructions: 'Check-in at 3 PM. Keys available at front desk. WiFi: ParadiseGuest, Password: Welcome123'
      },
      'BK456DEF': {
        property: 'Mountain View Hotel',
        check_in: '2024-03-01',
        check_out: '2024-03-05',
        nights: 4,
        guests: 3,
        total_price: '$640',
        payment_status: 'PENDING',
        confirmation: 'CONF_456789',
        cancellation: 'Non-refundable rate selected',
        instructions: 'Early check-in available on request. Room upgrade pending confirmation.'
      }
    };

    return bookings[bookingRef] || null;
  }
}

/**
 * ItineraryQAAgent
 * Answers questions about travel itineraries and scheduled activities
 */
class ItineraryQAAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['booking_reference', 'question'];
    this.sector = 'travel';
    this.agentType = 'ITINERARY_QA';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🗺️ [Travel] Answering itinerary question', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Get itinerary
      const itinerary = this.getItinerary(this.data.booking_reference);

      if (!itinerary) {
        this.emit('error', {
          message: 'Booking not found. Please verify your booking reference.',
          field: 'booking_reference'
        });
        return;
      }

      // Answer question
      const answer = this.answerItineraryQuestion(this.data.question, itinerary);

      this.result = {
        status: 'success',
        booking_reference: this.data.booking_reference,
        question: this.data.question,
        answer: answer.response,
        details: answer.details,
        contact_support: 'For more information, contact our travel concierge.'
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Travel] Itinerary question answered', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Travel] Itinerary QA error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      booking_reference: 'What is your booking reference number?',
      question: 'What would you like to know about your itinerary?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getItinerary(bookingRef) {
    const itineraries = {
      'BK123ABC': {
        destination: 'Maldives',
        activities: [
          { date: '2024-02-15', activity: 'Arrival and welcome dinner', time: '6:00 PM', location: 'Main Restaurant' },
          { date: '2024-02-16', activity: 'Snorkeling excursion', time: '8:00 AM', location: 'Coral Reef', duration: '4 hours' },
          { date: '2024-02-17', activity: 'Island hopping tour', time: '9:00 AM', location: 'East Islands', duration: '6 hours' },
          { date: '2024-02-18', activity: 'Spa day', time: '10:00 AM', location: 'Resort Spa', duration: '3 hours' },
          { date: '2024-02-19', activity: 'Sunset cruise', time: '4:00 PM', location: 'Departure Point', duration: '3 hours' }
        ]
      }
    };

    return itineraries[bookingRef] || null;
  }

  answerItineraryQuestion(question, itinerary) {
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('activity') || lowerQuestion.includes('activities')) {
      return {
        response: `Here are your scheduled activities:`,
        details: itinerary.activities.map(a => `${a.date}: ${a.activity} at ${a.time} (${a.location})`).join('\n')
      };
    } else if (lowerQuestion.includes('when') || lowerQuestion.includes('time')) {
      return {
        response: 'Your trip details:',
        details: `Check-in: 2024-02-15, Check-out: 2024-02-20, Total: 5 nights`
      };
    } else if (lowerQuestion.includes('location') || lowerQuestion.includes('where')) {
      return {
        response: `You're traveling to ${itinerary.destination}`,
        details: 'Your hotel is located in a prime beachfront area. Airport transfer included.'
      };
    }

    return {
      response: 'Here\'s information about your trip:',
      details: `Destination: ${itinerary.destination}, Activities: ${itinerary.activities.length} scheduled events`
    };
  }
}

/**
 * CheckinInfoAgent
 * Provides check-in procedures and important property information
 */
class CheckinInfoAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['booking_reference'];
    this.sector = 'travel';
    this.agentType = 'CHECKIN_INFO';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🔑 [Travel] Providing check-in information', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Get property information
      const propertyInfo = this.getPropertyInfo(this.data.booking_reference);

      if (!propertyInfo) {
        this.emit('error', {
          message: 'Booking not found.',
          field: 'booking_reference'
        });
        return;
      }

      this.result = {
        status: 'success',
        booking_reference: this.data.booking_reference,
        property_name: propertyInfo.name,
        address: propertyInfo.address,
        check_in_time: propertyInfo.check_in_time,
        check_out_time: propertyInfo.check_out_time,
        check_in_instructions: propertyInfo.instructions,
        wifi_name: propertyInfo.wifi_name,
        wifi_password: propertyInfo.wifi_password,
        parking_info: propertyInfo.parking,
        amenities: propertyInfo.amenities,
        emergency_contact: propertyInfo.emergency_contact,
        house_rules: propertyInfo.rules,
        key_location: propertyInfo.key_location,
        message: `Check-in is at ${propertyInfo.check_in_time}. Please arrive early enough to collect your keys from ${propertyInfo.key_location}.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Travel] Check-in info provided', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Travel] Check-in info error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      booking_reference: 'What is your booking reference number?'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getPropertyInfo(bookingRef) {
    const properties = {
      'BK123ABC': {
        name: 'Paradise Beach Resort',
        address: '123 Coral Way, Maldives 12345',
        check_in_time: '3:00 PM',
        check_out_time: '11:00 AM',
        instructions: 'Main entrance has a welcome desk. Staff will assist with baggage.',
        wifi_name: 'ParadiseGuest',
        wifi_password: 'Welcome123',
        parking: 'Complimentary beachfront parking available',
        amenities: ['Swimming Pool', 'Spa', 'Gym', 'Restaurant', 'Beach Access', 'Room Service'],
        emergency_contact: '+960 123-4567',
        rules: ['Quiet hours 10 PM - 8 AM', 'No smoking in rooms', 'Maximum 2 guests per room'],
        key_location: 'Front desk'
      },
      'BK456DEF': {
        name: 'Mountain View Hotel',
        address: '456 Alpine Road, Switzerland 98765',
        check_in_time: '2:00 PM',
        check_out_time: '10:00 AM',
        instructions: 'Check-in at reception. Early check-in available upon request.',
        wifi_name: 'MountainViewWiFi',
        wifi_password: 'AlpsLife2024',
        parking: 'Indoor parking with electric charging stations',
        amenities: ['Heated Indoor Pool', 'Mountain Spa', 'Sauna', 'Gourmet Restaurant', 'Hiking Trails'],
        emergency_contact: '+41 123-4567',
        rules: ['Quiet hours 11 PM - 7 AM', 'Smoking on balconies only', 'Pets allowed upon request'],
        key_location: 'Automated check-in kiosk or reception'
      }
    };

    return properties[bookingRef] || null;
  }
}

/**
 * DisruptionAlertAgent
 * Handles travel disruptions and provides alternative options
 */
class DisruptionAlertAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['booking_reference', 'disruption_type'];
    this.sector = 'travel';
    this.agentType = 'DISRUPTION_ALERT';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('⚠️ [Travel] Processing disruption alert', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Get disruption details
      const disruption = this.getDisruptionInfo(this.data.disruption_type);

      if (!disruption) {
        this.emit('error', {
          message: 'Invalid disruption type.',
          field: 'disruption_type'
        });
        return;
      }

      const alternatives = this.getAlternatives(disruption.type);

      this.result = {
        status: 'disruption_alert',
        booking_reference: this.data.booking_reference,
        disruption_type: this.data.disruption_type,
        issue: disruption.description,
        status_update: disruption.status,
        refund_eligible: disruption.refund_eligible,
        alternatives: alternatives,
        action_required: disruption.action_required,
        contact_support: '24/7 Support Team: 1-800-TRAVEL-1 or chat@travel.com',
        message: `We\'re aware of ${disruption.description}. ${disruption.status} We have ${alternatives.length} alternative options available for you.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Travel] Disruption handled', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Travel] Disruption alert error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      booking_reference: 'What is your booking reference number?',
      disruption_type: 'What is the disruption? (Flight Cancellation, Weather, Property Closure, Price Drop, Other)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getDisruptionInfo(disruptionType) {
    const disruptions = {
      'FLIGHT_CANCELLATION': {
        type: 'Flight Cancellation',
        description: 'your flight cancellation',
        status: 'Alternative flights have been secured.',
        refund_eligible: true,
        action_required: 'Please confirm your preferred rescheduled flight within 24 hours.'
      },
      'WEATHER': {
        type: 'Weather',
        description: 'severe weather at your destination',
        status: 'We are monitoring the situation closely.',
        refund_eligible: true,
        action_required: 'You can postpone or cancel your trip without penalties.'
      },
      'PROPERTY_CLOSURE': {
        type: 'Property Closure',
        description: 'your booked property being temporarily closed',
        status: 'Alternative accommodations of equal or better quality have been arranged.',
        refund_eligible: true,
        action_required: 'We will cover any price difference.'
      },
      'PRICE_DROP': {
        type: 'Price Drop',
        description: 'a significant price reduction for your booking',
        status: 'You are eligible for a refund of the difference.',
        refund_eligible: false,
        action_required: 'Accept the refund or upgrade your accommodations at no extra cost.'
      }
    };

    return disruptions[disruptionType] || null;
  }

  getAlternatives(disruptionType) {
    const alternatives = {
      'Flight Cancellation': [
        { option: 'Flight 1', departure: '2024-02-16 08:00 AM', airline: 'United Airlines', status: 'AVAILABLE' },
        { option: 'Flight 2', departure: '2024-02-16 02:00 PM', airline: 'Delta Airlines', status: 'AVAILABLE' },
        { option: 'Flight 3', departure: '2024-02-17 06:00 AM', airline: 'American Airlines', status: 'AVAILABLE' }
      ],
      'Property Closure': [
        { property: 'Luxury Ocean View Villa', stars: 5, price: 'Same', availability: 'Available' },
        { property: 'Beach Resort Deluxe', stars: 5, price: 'Same', availability: 'Available' },
        { property: 'Tropical Paradise Hotel', stars: 4, price: 'Lower', availability: 'Available' }
      ],
      'Weather': [
        { option: 'Postpone trip to next week', status: 'No charges' },
        { option: 'Reschedule to alternative destination', status: 'Price match guaranteed' },
        { option: 'Full refund', status: 'Available' }
      ]
    };

    return alternatives[disruptionType] || [];
  }
}

module.exports = {
  BookingConfirmationAgent,
  ItineraryQAAgent,
  CheckinInfoAgent,
  DisruptionAlertAgent
};
