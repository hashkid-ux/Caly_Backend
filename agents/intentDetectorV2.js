// agents/intentDetectorV2.js - Sector-aware intent detection
// ✅ SECTOR EXPANSION: New intent detector that loads patterns from database

const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

class IntentDetectorV2 {
  constructor(database) {
    this.db = database;
    this.patternCache = {}; // Cache patterns per sector to avoid DB hits on every detect
    this.cacheExpiry = 3600000; // 1 hour cache
  }

  /**
   * Load intent patterns from database for a specific sector
   * Falls back to in-memory patterns if database is unavailable
   * @param {string} sector - Business sector (ecommerce, healthcare, realestate, etc.)
   * @param {string} language - Language code (en, hi, es, fr, etc.)
   * @returns {Promise<object>} - Intent patterns
   */
  async getIntentPatternsForSector(sector, language = 'en') {
    const cacheKey = `${sector}_${language}`;
    
    // Check cache
    if (this.patternCache[cacheKey] && 
        Date.now() - this.patternCache[cacheKey].timestamp < this.cacheExpiry) {
      logger.debug('🔄 [Intent] Using cached patterns', { sector, language });
      return this.patternCache[cacheKey].patterns;
    }

    try {
      // Load patterns from database
      if (this.db) {
        const patterns = await this.db.query(
          `SELECT intent, regex_pattern, examples, priority 
           FROM sector_intent_patterns 
           WHERE sector = $1 AND language = $2 
           ORDER BY priority ASC`,
          [sector, language]
        );

        const intentMap = {};
        patterns.rows.forEach(row => {
          if (!intentMap[row.intent]) {
            intentMap[row.intent] = [];
          }
          intentMap[row.intent].push(new RegExp(row.regex_pattern, 'i'));
        });

        // Cache the patterns
        this.patternCache[cacheKey] = {
          patterns: intentMap,
          timestamp: Date.now()
        };

        logger.debug('✅ [Intent] Loaded patterns from database', { sector, language, intents: Object.keys(intentMap).length });
        return intentMap;
      }
    } catch (err) {
      logger.warn('⚠️  [Intent] Failed to load patterns from database, using fallback', { error: err.message });
    }

    // Fallback to hardcoded patterns if database unavailable
    return this.getDefaultPatternsForSector(sector, language);
  }

  /**
   * Get default (hardcoded) patterns for a sector
   * Used as fallback if database is unavailable
   * @param {string} sector - Business sector
   * @param {string} language - Language code
   * @returns {object} - Intent patterns
   */
  getDefaultPatternsForSector(sector, language = 'en') {
    // Default patterns - can be overridden by database
    const defaultPatterns = {
      // Generic patterns (work for all sectors)
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
      ],
      ESCALATION: [
        /agent.*chahiye/i,
        /agent.*laao/i,
        /human.*chahiye/i,
        /speak.*human/i,
        /representative/i
      ]
    };

    // Sector-specific patterns
    const sectorPatterns = {
      ecommerce: {
        ORDER_LOOKUP: [
          /order.*status/i,
          /order.*kaha.*hai/i,
          /order.*check/i,
          /mera.*order/i,
          /delivery.*kab/i
        ],
        RETURN_REQUEST: [
          /return.*karna.*hai/i,
          /return.*chahiye/i,
          /wapas.*bhej/i,
          /galat.*product/i
        ],
        REFUND: [
          /refund/i,
          /paisa.*wapas/i,
          /money.*back/i
        ],
        CANCEL_ORDER: [
          /cancel.*karna/i,
          /cancel.*kar.*do/i,
          /nahi.*chahiye/i
        ],
        TRACKING: [
          /tracking/i,
          /kahan.*pahunch/i,
          /delivery.*location/i
        ],
        PAYMENT_ISSUE: [
          /payment.*fail/i,
          /payment.*nahi.*hua/i,
          /paisa.*cut.*gaya/i
        ]
      },
      healthcare: {
        BOOK_APPOINTMENT: [
          /book.*appointment/i,
          /appointment.*chahiye/i,
          /doctor.*milna.*hai/i,
          /clinic.*mein.*aa.*saku/i,
          /schedule.*visit/i
        ],
        PRESCRIPTION_REFILL: [
          /prescription.*refill/i,
          /medicine.*chahiye/i,
          /medicines.*refill/i,
          /dawa.*khatm/i,
          /naya.*prescription/i
        ],
        SYMPTOM_CHECK: [
          /symptoms/i,
          /symptoms.*check/i,
          /triage/i,
          /mujhe.*lag.*raha/i,
          /fever.*hai/i,
          /cough.*hai/i
        ],
        APPOINTMENT_REMINDER: [
          /appointment.*kab/i,
          /appointment.*reminder/i,
          /mera.*appointment/i
        ],
        RESCHEDULE_APPOINTMENT: [
          /reschedule/i,
          /appointment.*change/i,
          /appointment.*nahi.*aa.*sakta/i,
          /dobara.*appointment/i
        ]
      },
      realestate: {
        PROPERTY_INQUIRY: [
          /property/i,
          /house/i,
          /apartment/i,
          /listing/i,
          /details.*chahiye/i,
          /price.*kya.*hai/i
        ],
        SCHEDULE_SHOWING: [
          /showing.*schedule/i,
          /visit.*property/i,
          /dekna.*chahta/i,
          /tour.*chahiye/i,
          /viewing.*time/i
        ],
        MAKE_OFFER: [
          /offer/i,
          /bid/i,
          /submit.*offer/i,
          /price.*offer/i
        ],
        OFFER_STATUS: [
          /offer.*status/i,
          /mera.*offer/i,
          /accepted.*kya/i
        ]
      },
      logistics: {
        TRACK_PARCEL: [
          /tracking/i,
          /track.*parcel/i,
          /parcel.*kaha/i,
          /delivery.*kab/i,
          /shipment.*status/i
        ],
        SCHEDULE_PICKUP: [
          /pickup/i,
          /schedule.*pickup/i,
          /parcel.*pickup/i,
          /collection.*schedule/i
        ],
        DELIVERY_FAILURE: [
          /delivery.*fail/i,
          /missed.*delivery/i,
          /rescheduled.*delivery/i,
          /address.*wrong/i
        ]
      },
      fintech: {
        CHECK_BALANCE: [
          /balance/i,
          /account.*balance/i,
          /kitna.*paisa/i,
          /available.*funds/i
        ],
        VERIFY_TRANSACTION: [
          /verify/i,
          /otp/i,
          /confirm.*transaction/i,
          /transaction.*verify/i
        ],
        REPORT_FRAUD: [
          /fraud/i,
          /unauthorized/i,
          /dispute.*transaction/i,
          /wrong.*charge/i
        ]
      }
    };

    // Merge sector-specific with generic patterns
    const merged = { ...defaultPatterns };
    if (sectorPatterns[sector]) {
      Object.assign(merged, sectorPatterns[sector]);
    }

    logger.debug('✅ [Intent] Using default patterns for sector', { sector, language, intents: Object.keys(merged).length });
    return merged;
  }

  /**
   * Get entity extraction patterns for a sector
   * @param {string} sector - Business sector
   * @returns {Promise<object>} - Entity patterns
   */
  async getEntityPatternsForSector(sector) {
    const cacheKey = `entities_${sector}`;
    
    if (this.patternCache[cacheKey] && 
        Date.now() - this.patternCache[cacheKey].timestamp < this.cacheExpiry) {
      return this.patternCache[cacheKey].patterns;
    }

    try {
      if (this.db) {
        const entities = await this.db.query(
          `SELECT entity_type, extraction_hints FROM sector_entities WHERE sector = $1`,
          [sector]
        );

        const entityMap = {};
        entities.rows.forEach(row => {
          entityMap[row.entity_type] = row.extraction_hints || [];
        });

        this.patternCache[cacheKey] = {
          patterns: entityMap,
          timestamp: Date.now()
        };

        return entityMap;
      }
    } catch (err) {
      logger.warn('⚠️  [Intent] Failed to load entities from database', { error: err.message });
    }

    // Fallback entity patterns
    return this.getDefaultEntityPatternsForSector(sector);
  }

  /**
   * Default entity patterns by sector
   */
  getDefaultEntityPatternsForSector(sector) {
    const defaultEntities = {
      ecommerce: {
        order_id: [/order.*?(\d{4,10})/i, /\b(\d{4,10})\b/],
        product_id: [/product.*?(\d+)/i, /sku.*?(\d+)/i],
        tracking_number: [/tracking.*?(\d+)/i, /awb.*?(\d+)/i],
        phone: [/(\+?\d{10,12})/],
        email: [/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/]
      },
      healthcare: {
        patient_id: [/patient.*?(\d+)/i, /mrn.*?(\d+)/i],
        appointment_id: [/appointment.*?(\d+)/i, /slot.*?(\d+)/i],
        prescription_id: [/prescription.*?(\d+)/i, /rx.*?(\d+)/i],
        phone: [/(\+?\d{10,12})/],
        email: [/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/]
      },
      realestate: {
        property_id: [/property.*?(\d+)/i, /listing.*?(\d+)/i],
        phone: [/(\+?\d{10,12})/],
        email: [/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/]
      },
      logistics: {
        parcel_id: [/parcel.*?(\d+)/i, /shipment.*?(\d+)/i],
        tracking_number: [/tracking.*?(\d+)/i, /awb.*?(\d+)/i],
        phone: [/(\+?\d{10,12})/]
      }
    };

    return defaultEntities[sector] || defaultEntities.ecommerce;
  }

  /**
   * Detect intent from transcript (async version)
   * @param {string} transcript - User's speech
   * @param {string} sector - Business sector
   * @param {string} language - Language (en, hi)
   * @returns {Promise<object>} - { intent, confidence, entities }
   */
  async detectAsync(transcript, sector = 'ecommerce', language = 'en') {
    try {
      const patterns = await this.getIntentPatternsForSector(sector, language);
      const entities = await this.getEntityPatternsForSector(sector);
      
      return this.detect(transcript, { patterns, entities });
    } catch (err) {
      logger.error('❌ [Intent] Async detection failed:', err);
      // Fallback to sync version
      return this.detect(transcript);
    }
  }

  /**
   * Synchronous intent detection (used by orchestrator)
   * Uses pre-loaded patterns from async method
   * @param {string} transcript - User's speech
   * @param {object} context - { patterns, entities } - Can be pre-loaded
   * @returns {object} - { intent, confidence, entities, requiresAgent }
   */
  detect(transcript, context = {}) {
    const text = transcript.toLowerCase().trim();
    let patterns = context.patterns;

    // Fallback to e-commerce if no patterns provided
    if (!patterns) {
      patterns = this.getDefaultPatternsForSector('ecommerce', 'en');
    }

    logger.debug('🔍 [Intent] Detecting intent', { transcript: text, sector: context.sector });

    // Check for cancellation first
    if (this.matchesIntent(text, patterns, 'CANCEL_ACTION')) {
      return {
        intent: 'CANCEL_ACTION',
        confidence: 0.95,
        entities: {},
        requiresAgent: false,
        shouldCancelAgent: true
      };
    }

    // Check for escalation
    if (this.matchesIntent(text, patterns, 'ESCALATION')) {
      return {
        intent: 'ESCALATION',
        confidence: 0.9,
        entities: {},
        requiresAgent: true,
        shouldEscalate: true
      };
    }

    // Check for greetings
    if (this.matchesIntent(text, patterns, 'GREETING') && text.length < 20) {
      return {
        intent: 'GREETING',
        confidence: 0.9,
        entities: {},
        requiresAgent: false
      };
    }

    // Check all other intents
    const allIntents = Object.keys(patterns).filter(
      i => !['GREETING', 'CANCEL_ACTION', 'ESCALATION'].includes(i)
    );

    for (const intent of allIntents) {
      if (this.matchesIntent(text, patterns, intent)) {
        const entities = this.extractEntities(text, context.entities);
        return {
          intent,
          confidence: 0.85,
          entities,
          requiresAgent: true
        };
      }
    }

    // Unknown intent - escalate
    return {
      intent: 'UNKNOWN',
      confidence: 0.3,
      entities: {},
      requiresAgent: true,
      shouldEscalate: true
    };
  }

  /**
   * Check if text matches an intent pattern
   */
  matchesIntent(text, patterns, intent) {
    if (!patterns[intent]) {
      return false;
    }

    return patterns[intent].some(regex => regex.test(text));
  }

  /**
   * Extract entities from transcript
   */
  extractEntities(transcript, entityPatterns = {}) {
    const entities = {};

    if (!entityPatterns || Object.keys(entityPatterns).length === 0) {
      return entities;
    }

    // For each entity type, try to extract from transcript
    for (const [entityType, hints] of Object.entries(entityPatterns)) {
      // Create regex patterns from hints if they're strings
      const patterns = hints.map(hint => {
        if (typeof hint === 'string') {
          return new RegExp(hint, 'i');
        }
        return hint;
      });

      // Try to match
      for (const pattern of patterns) {
        const match = transcript.match(pattern);
        if (match) {
          entities[entityType] = match[match.length - 1] || match[0];
          break;
        }
      }
    }

    return entities;
  }

  /**
   * Clear cache (useful for testing or forcing refresh)
   */
  clearCache() {
    this.patternCache = {};
    logger.debug('🗑️  [Intent] Cache cleared');
  }
}

module.exports = IntentDetectorV2;
