// agents/intentDetector.js - Intent detection and entity extraction
const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

class IntentDetector {
  constructor() {
    // Intent patterns (Hindi/Hinglish)
    this.intentPatterns = {
      ORDER_LOOKUP: [
        /order.*status/i,
        /order.*kaha.*hai/i,
        /order.*check/i,
        /order.*track/i,
        /mera.*order/i,
        /delivery.*kab/i,
        /shipment/i
      ],
      RETURN_REQUEST: [
        /return.*karna.*hai/i,
        /return.*chahiye/i,
        /wapas.*bhej/i,
        /product.*wapas/i,
        /galat.*product/i,
        /defective/i,
        /damaged/i
      ],
      REFUND: [
        /refund/i,
        /paisa.*wapas/i,
        /money.*back/i,
        /payment.*return/i,
        /amount.*wapas/i
      ],
      CANCEL_ORDER: [
        /cancel.*karna/i,
        /cancel.*kar.*do/i,
        /order.*cancel/i,
        /nahi.*chahiye/i,
        /mat.*bhejo/i
      ],
      TRACKING: [
        /tracking/i,
        /track.*karo/i,
        /location.*kya.*hai/i,
        /kahan.*pahunch/i,
        /delivery.*boy/i
      ],
      PRODUCT_INQUIRY: [
        /product.*available/i,
        /stock.*hai/i,
        /product.*detail/i,
        /specifications/i,
        /price.*kya.*hai/i
      ],
      PAYMENT_ISSUE: [
        /payment.*fail/i,
        /payment.*nahi.*hua/i,
        /paisa.*cut.*gaya/i,
        /transaction.*fail/i,
        /debit.*ho.*gaya/i
      ],
      ADDRESS_CHANGE: [
        /address.*change/i,
        /address.*update/i,
        /location.*change/i,
        /delivery.*address/i
      ],
      COMPLAINT: [
        /complaint/i,
        /shikayat/i,
        /problem.*hai/i,
        /issue.*hai/i,
        /bahut.*bura/i,
        /not.*satisfied/i
      ],
      EXCHANGE: [
        /exchange/i,
        /size.*change/i,
        /color.*change/i,
        /different.*size/i,
        /badal.*do/i
      ],
      COD_ISSUE: [
        /cod/i,
        /cash.*delivery/i,
        /pay.*kaise/i,
        /payment.*method/i
      ],
      INVOICE: [
        /invoice/i,
        /bill/i,
        /receipt/i,
        /gst/i
      ],
      REGISTRATION: [
        /register/i,
        /sign.*up/i,
        /account.*banao/i,
        /new.*account/i
      ],
      TECHNICAL_SUPPORT: [
        /app.*nahi.*chal/i,
        /website.*error/i,
        /login.*nahi.*ho/i,
        /technical.*problem/i,
        /app.*crash/i
      ],
      GREETING: [
        /^hello$/i,
        /^hi$/i,
        /^namaste$/i,
        /^haan$/i,
        /^ji$/i,
        /^yes$/i
      ],
      CANCEL_ACTION: [
        /rehne.*do/i,
        /cancel.*karo/i,
        /nahi.*chahiye/i,
        /mat.*karo/i,
        /chodo/i,
        /forget.*it/i
      ]
    };

    // Entity extraction patterns
    this.entityPatterns = {
      order_id: [
        /order.*?(\d{4,10})/i,
        /\b(\d{4,10})\b/,
        /number.*?(\d{4,10})/i
      ],
      phone: [
        /(\+?\d{10,12})/,
        /phone.*?(\d{10})/i,
        /mobile.*?(\d{10})/i
      ],
      email: [
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
      ],
      amount: [
        /₹\s*(\d+)/,
        /rupees?\s*(\d+)/i,
        /rs\.?\s*(\d+)/i
      ],
      pin_code: [
        /pin.*?(\d{6})/i,
        /pincode.*?(\d{6})/i,
        /postal.*?(\d{6})/i
      ]
    };
  }

  /**
   * Detect intent from user transcript
   * @param {string} transcript - User's speech text
   * @param {object} conversationContext - Previous conversation
   * @returns {object} - { intent, confidence, entities, requiresAgent }
   */
  detect(transcript, conversationContext = []) {
    const text = transcript.toLowerCase().trim();

    logger.debug('Detecting intent', { transcript: text });

    // Check for cancellation first
    if (this.matchesIntent(text, 'CANCEL_ACTION')) {
      return {
        intent: 'CANCEL_ACTION',
        confidence: 0.95,
        entities: {},
        requiresAgent: false,
        shouldCancelAgent: true
      };
    }

    // Check for simple greetings
    if (this.matchesIntent(text, 'GREETING') && text.length < 20) {
      return {
        intent: 'GREETING',
        confidence: 0.9,
        entities: {},
        requiresAgent: false
      };
    }

    // Check all agent-triggering intents
    const intents = [
      'ORDER_LOOKUP',
      'RETURN_REQUEST',
      'REFUND',
      'CANCEL_ORDER',
      'TRACKING',
      'PRODUCT_INQUIRY',
      'PAYMENT_ISSUE',
      'ADDRESS_CHANGE',
      'COMPLAINT',
      'EXCHANGE',
      'COD_ISSUE',
      'INVOICE',
      'REGISTRATION',
      'TECHNICAL_SUPPORT'
    ];

    for (const intent of intents) {
      if (this.matchesIntent(text, intent)) {
        const entities = this.extractEntities(text);
        
        return {
          intent,
          confidence: 0.85,
          entities,
          requiresAgent: true,
          agentType: this.intentToAgent(intent),
          originalText: transcript
        };
      }
    }

    // No specific intent detected - normal conversation
    return {
      intent: 'CHAT',
      confidence: 0.7,
      entities: this.extractEntities(text),
      requiresAgent: false,
      originalText: transcript
    };
  }

  /**
   * Check if text matches intent patterns
   */
  matchesIntent(text, intent) {
    const patterns = this.intentPatterns[intent] || [];
    return patterns.some(pattern => pattern.test(text));
  }

  /**
   * Extract entities from text
   */
  extractEntities(text) {
    const entities = {};

    for (const [entityType, patterns] of Object.entries(this.entityPatterns)) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          entities[entityType] = match[1] || match[0];
          break;
        }
      }
    }

    return entities;
  }

  /**
   * Map intent to agent type
   */
  intentToAgent(intent) {
    const mapping = {
      ORDER_LOOKUP: 'OrderLookupAgent',
      RETURN_REQUEST: 'ReturnAgent',
      REFUND: 'RefundAgent',
      CANCEL_ORDER: 'CancelOrderAgent',
      TRACKING: 'TrackingAgent',
      PRODUCT_INQUIRY: 'ProductInquiryAgent',
      PAYMENT_ISSUE: 'PaymentIssueAgent',
      ADDRESS_CHANGE: 'AddressChangeAgent',
      COMPLAINT: 'ComplaintAgent',
      EXCHANGE: 'ExchangeAgent',
      COD_ISSUE: 'CODAgent',
      INVOICE: 'InvoiceAgent',
      REGISTRATION: 'RegistrationAgent',
      TECHNICAL_SUPPORT: 'TechnicalSupportAgent'
    };

    return mapping[intent] || null;
  }

  /**
   * Check if waiting for specific entity in context
   */
  isWaitingForEntity(conversationContext) {
    // Check last few messages to see if we asked for order_id, phone, etc.
    const recent = conversationContext.slice(-3);
    
    for (const msg of recent) {
      if (msg.role === 'assistant') {
        const text = msg.content.toLowerCase();
        
        if (text.includes('order') && text.includes('number')) {
          return { entity: 'order_id', context: 'ORDER_LOOKUP' };
        }
        if (text.includes('phone') || text.includes('mobile')) {
          return { entity: 'phone', context: 'VERIFICATION' };
        }
        if (text.includes('pin') || text.includes('pincode')) {
          return { entity: 'pin_code', context: 'ADDRESS' };
        }
      }
    }

    return null;
  }
}

module.exports = IntentDetector;