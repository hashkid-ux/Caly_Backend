/**
 * Input Validation Middleware Module
 * 
 * Provides centralized schema-based validation for HTTP requests.
 * Supports validation of request bodies, query parameters, and URL parameters.
 * Includes automatic sanitization and consistent error responses.
 * 
 * Features:
 * - 11 built-in validators (email, phone, URL, string, number, enum, array, date, UUID, alphanumeric, etc.)
 * - Schema-based validation with customizable rules
 * - Automatic input sanitization (trim, escape HTML, etc.)
 * - Reusable common schemas (login, register, pagination, etc.)
 * - Consistent validation error responses
 * 
 * @module middleware/validation
 * @requires middleware/errorHandler
 */

const { ValidationError } = require('./errorHandler');

/**
 * Built-in Validator Functions
 * 
 * Each validator returns true if valid, false otherwise.
 * Validators may accept options object for additional configuration.
 * 
 * @namespace validators
 */
const validators = {
  /**
   * Validate email address format
   * 
   * @param {string} value - Email to validate
   * @returns {boolean} true if valid email format
   * 
   * @example
   * validators.email('user@example.com')  // true
   * validators.email('invalid-email')     // false
   */
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },

  /**
   * Validate phone number (basic international format)
   * 
   * Accepts E.164 format (+1234567890) and common variations.
   * Requires minimum 10 digits.
   * 
   * @param {string} value - Phone number to validate
   * @returns {boolean} true if valid phone format
   * 
   * @example
   * validators.phone('+1-234-567-8900')     // true
   * validators.phone('234 567 8900')        // true
   * validators.phone('1234567')             // false
   */
  phone: (value) => {
    const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
    return phoneRegex.test(value.replace(/\s/g, ''));
  },

  /**
   * Validate URL format (must include protocol)
   * 
   * @param {string} value - URL to validate
   * @returns {boolean} true if valid URL
   * 
   * @example
   * validators.url('https://example.com')   // true
   * validators.url('example.com')           // false (missing protocol)
   */
  url: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Validate string with optional length constraints
   * 
   * @param {string} value - String to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.min] - Minimum string length
   * @param {number} [options.max] - Maximum string length
   * @returns {boolean} true if valid string
   * 
   * @example
   * validators.string('hello', { min: 1, max: 10 })  // true
   * validators.string('', { min: 1 })               // false
   */
  string: (value, options = {}) => {
    if (typeof value !== 'string') return false;
    if (options.min && value.length < options.min) return false;
    if (options.max && value.length > options.max) return false;
    return true;
  },

  /**
   * Validate number with optional range constraints
   * 
   * @param {number} value - Number to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.min] - Minimum value
   * @param {number} [options.max] - Maximum value
   * @param {boolean} [options.integer] - Require integer (no decimals)
   * @returns {boolean} true if valid number
   * 
   * @example
   * validators.number(42, { min: 0, max: 100 })     // true
   * validators.number(3.14, { integer: true })      // false
   */
  number: (value, options = {}) => {
    const num = Number(value);
    if (isNaN(num)) return false;
    if (options.min !== undefined && num < options.min) return false;
    if (options.max !== undefined && num > options.max) return false;
    if (options.integer && !Number.isInteger(num)) return false;
    return true;
  },

  /**
   * Validate value against allowed enum values
   * 
   * @param {*} value - Value to validate
   * @param {Array} allowedValues - List of allowed values
   * @returns {boolean} true if value is in allowed list
   * 
   * @example
   * validators.enum('active', ['active', 'inactive', 'pending'])  // true
   * validators.enum('deleted', ['active', 'inactive'])            // false
   */
  enum: (value, allowedValues) => {
    return allowedValues.includes(value);
  },

  /**
   * Validate array with optional length constraints
   * 
   * @param {Array} value - Array to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.min] - Minimum array length
   * @param {number} [options.max] - Maximum array length
   * @returns {boolean} true if valid array
   * 
   * @example
   * validators.array([1, 2, 3], { min: 1, max: 10 })  // true
   * validators.array([], { min: 1 })                  // false (too short)
   */
  array: (value, options = {}) => {
    if (!Array.isArray(value)) return false;
    if (options.min && value.length < options.min) return false;
    if (options.max && value.length > options.max) return false;
    return true;
  },

  /**
   * Validate date/datetime format
   * 
   * @param {string|Date} value - Date to validate
   * @returns {boolean} true if valid date
   * 
   * @example
   * validators.date('2024-01-15')         // true
   * validators.date('2024-01-15T10:30:00')  // true
   * validators.date('invalid')            // false
   */
  date: (value) => {
    const date = new Date(value);
    return date instanceof Date && !isNaN(date);
  },

  /**
   * Validate UUID format (v4)
   * 
   * @param {string} value - UUID to validate
   * @returns {boolean} true if valid UUID
   * 
   * @example
   * validators.uuid('550e8400-e29b-41d4-a716-446655440000')  // true
   * validators.uuid('not-a-uuid')                             // false
   */
  uuid: (value) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  /**
   * Validate alphanumeric string (letters and numbers only)
   * 
   * @param {string} value - String to validate
   * @returns {boolean} true if alphanumeric
   * 
   * @example
   * validators.alphanumeric('hello123')  // true
   * validators.alphanumeric('hello-123') // false (contains hyphen)
   */
  alphanumeric: (value) => {
    return /^[a-zA-Z0-9]+$/.test(value);
  },

  /**
   * Validate no special characters (allows only letters, numbers, spaces, hyphens, underscores, dots)
   * 
   * Useful for names, usernames, file names, etc.
   * 
   * @param {string} value - String to validate
   * @returns {boolean} true if no special characters
   * 
   * @example
   * validators.noSpecialChars('John Doe')    // true
   * validators.noSpecialChars('john_doe')    // true
   * validators.noSpecialChars('john@doe')    // false (@ not allowed)
   */
  noSpecialChars: (value) => {
    return /^[a-zA-Z0-9\s\-_.]+$/.test(value);
  },
};

/**
 * User-Friendly Error Message Mapper
 * Converts technical validation errors into helpful messages for users.
 */
const errorMessages = {
  shopifyStore: {
    url: 'Store URL must start with https:// (e.g., https://mystore.myshopify.com)',
    helper: 'Format: https://yourstore.myshopify.com'
  },
  shopifyApiKey: {
    minLength: 'API key must be at least 32 characters (usually starts with "shppa_")',
    helper: 'Find in Shopify Admin > App settings'
  },
  shopifyApiSecret: {
    minLength: 'API secret must be at least 32 characters (usually starts with "shpss_")',
    helper: 'Keep this secret secure'
  },
  exotelNumber: {
    phone: 'Phone must be in E.164 format (e.g., +91 8000000000)',
    helper: 'Format: +[country][number] like +91 8012345678'
  },
  exotelSid: {
    minLength: 'SID must be at least 5 characters',
    helper: 'Your Exotel Subscriber ID from dashboard'
  },
  exotelToken: {
    minLength: 'API token must be at least 20 characters',
    helper: 'From Exotel dashboard - keep it private'
  },
  returnWindowDays: {
    range: 'Return window must be between 1 and 365 days',
    helper: 'Days customers can return items (1-365)'
  },
  refundAutoThreshold: {
    range: 'Refund threshold must be 0 or higher',
    helper: 'Refund orders below this amount automatically (₹)'
  },
  cancelWindowHours: {
    range: 'Cancel window must be 0 or higher',
    helper: 'Hours customers have to cancel orders'
  },
  escalationThreshold: {
    range: 'Escalation threshold must be 0 or higher',
    helper: 'Escalate issues below this confidence level'
  },
  timezone: {
    helper: 'Used for scheduling and displaying times'
  },
  language: {
    helper: 'Default language for communications'
  }
};

function getUserFriendlyErrorMessage(field, errorType) {
  const fieldMessages = errorMessages[field];
  if (!fieldMessages) return `Please check ${field}`;
  return fieldMessages[errorType] || `Please check ${field}`;
}

/**
 * Schema Validator Class
 * 
 * Validates data against a predefined schema with field rules.
 * Supports required fields, type validation, and format validation.
 * 
 * Schema Structure:
 * ```
 * {
 *   fieldName: {
 *     required: boolean,
 *     type: 'email'|'phone'|'string'|'number'|'uuid'|etc,
 *     options: { min, max, ... }  // Type-specific options
 *   }
 * }
 * ```
 * 
 * @class SchemaValidator
 * 
 * @example
 * const schema = {
 *   email: { required: true, type: 'email' },
 *   phone: { type: 'phone' },
 *   age: { required: true, type: 'number', options: { min: 18, max: 120 } }
 * };
 * const validator = new SchemaValidator(schema);
 * const result = validator.validate(userData);
 */
class SchemaValidator {
  /**
   * Initialize schema validator with validation rules
   * 
   * @param {Object} schema - Field validation rules
   */
  constructor(schema) {
    this.schema = schema;
  }

  /**
   * Validate data against entire schema
   * 
   * Checks all fields defined in schema. Collects all errors
   * before returning to provide complete validation feedback.
   * 
   * @param {Object} data - Data object to validate
   * @returns {Object} Validation result
   * @returns {boolean} result.valid - Whether all fields are valid
   * @returns {Object} result.errors - Field-level errors (empty if valid)
   * @returns {string[]} result.errors.fieldName - Array of error messages for field
   * 
   * @example
   * const result = validator.validate({ email: 'test@example.com', age: 25 });
   * if (!result.valid) {
   *   console.log('Validation errors:', result.errors);
   *   // { email: ['...'], age: ['...'] }
   * }
   */
  validate(data) {
    const errors = {};

    for (const [field, rules] of Object.entries(this.schema)) {
      const value = data[field];
      const fieldErrors = this.validateField(field, value, rules);

      if (fieldErrors.length > 0) {
        errors[field] = fieldErrors;
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  /**
   * Validate individual field against rules
   * 
   * @private
   * @param {string} field - Field name for error messages
   * @param {*} value - Field value to validate
   * @param {Object} rules - Validation rules for field
   * @returns {string[]} Array of error messages (empty if valid)
   */
  validateField(field, value, rules) {
    const errors = [];

    // Required validation
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      return errors;
    }

    // Skip further validation if not required and empty
    if (!rules.required && (value === undefined || value === null || value === '')) {
      return errors;
    }

    // Type validation
    if (rules.type) {
      const typeError = this.validateType(field, value, rules.type, rules);
      if (typeError) {
        errors.push(typeError);
        return errors;
      }
    }

    // Custom validation function
    if (rules.validate && typeof rules.validate === 'function') {
      if (!rules.validate(value)) {
        errors.push(rules.message || `${field} validation failed`);
      }
    }

    // Min length - use friendly messages when available
    if (rules.minLength && value.length < rules.minLength) {
      const friendlyMsg = getUserFriendlyErrorMessage(field, 'minLength');
      errors.push(friendlyMsg || `${field} must be at least ${rules.minLength} characters`);
    }

    // Max length
    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(`${field} must not exceed ${rules.maxLength} characters`);
    }

    // Enum values
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }

    // Pattern (regex)
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(rules.message || `${field} format is invalid`);
    }

    return errors;
  }

  /**
   * Validate type - uses friendly error messages from errorMessages mapper
   */
  validateType(field, value, type, rules) {
    switch (type) {
      case 'email':
        return !validators.email(value) ? getUserFriendlyErrorMessage(field, 'email') || `${field} must be a valid email` : null;

      case 'phone':
        return !validators.phone(value) ? getUserFriendlyErrorMessage(field, 'phone') || `${field} must be in proper format` : null;

      case 'url':
        return !validators.url(value) ? getUserFriendlyErrorMessage(field, 'url') || `${field} must be a valid URL` : null;

      case 'string':
        return typeof value !== 'string' ? `${field} must be a string` : null;

      case 'number':
        if (isNaN(Number(value))) {
          return `${field} must be a number`;
        }
        if (rules.min && Number(value) < rules.min) {
          const friendlyMsg = getUserFriendlyErrorMessage(field, 'range');
          return friendlyMsg || `${field} must be at least ${rules.min}`;
        }
        if (rules.max && Number(value) > rules.max) {
          const friendlyMsg = getUserFriendlyErrorMessage(field, 'range');
          return friendlyMsg || `${field} must not exceed ${rules.max}`;
        }
        return null;

      case 'array':
        return !Array.isArray(value) ? `${field} must be an array` : null;

      case 'date':
        return !validators.date(value) ? `${field} must be a valid date` : null;

      case 'uuid':
        return !validators.uuid(value) ? `${field} must be a valid UUID` : null;

      case 'boolean':
        return typeof value !== 'boolean' ? `${field} must be a boolean` : null;

      default:
        return null;
    }
  }
}

/**
 * Validate request body middleware factory
 */
const validateBody = (schema) => {
  return (req, res, next) => {
    const validator = new SchemaValidator(schema);
    const { valid, errors } = validator.validate(req.body);

    if (!valid) {
      // Transform errors to include field details for frontend error display
      const fieldDetails = {};
      Object.entries(errors).forEach(([field, errorMessages]) => {
        fieldDetails[field] = {
          valid: false,
          message: errorMessages[0] || 'Invalid value',
          errors: errorMessages
        };
      });
      
      const err = new ValidationError('Some fields need attention', fieldDetails);
      throw err;
    }

    next();
  };
};

/**
 * Validate query parameters middleware factory
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const validator = new SchemaValidator(schema);
    const { valid, errors } = validator.validate(req.query);

    if (!valid) {
      throw new ValidationError('Query validation failed', errors);
    }

    next();
  };
};

/**
 * Validate URL parameters middleware factory
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const validator = new SchemaValidator(schema);
    const { valid, errors } = validator.validate(req.params);

    if (!valid) {
      throw new ValidationError('Parameter validation failed', errors);
    }

    next();
  };
};

/**
 * Sanitization utilities
 */
const sanitizers = {
  /**
   * Trim whitespace
   */
  trim: (value) => {
    return typeof value === 'string' ? value.trim() : value;
  },

  /**
   * Convert to lowercase
   */
  toLowerCase: (value) => {
    return typeof value === 'string' ? value.toLowerCase() : value;
  },

  /**
   * Convert to uppercase
   */
  toUpperCase: (value) => {
    return typeof value === 'string' ? value.toUpperCase() : value;
  },

  /**
   * Remove special characters
   */
  removeSpecialChars: (value) => {
    return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9]/g, '') : value;
  },

  /**
   * Escape HTML entities
   */
  escapeHtml: (value) => {
    if (typeof value !== 'string') return value;
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return value.replace(/[&<>"']/g, (char) => map[char]);
  },

  /**
   * Parse JSON safely
   */
  parseJson: (value) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },
};

/**
 * Sanitize request data
 */
const sanitizeData = (data, rules = {}) => {
  const sanitized = { ...data };

  for (const [field, sanitizeFunctions] of Object.entries(rules)) {
    if (sanitized[field]) {
      if (typeof sanitizeFunctions === 'function') {
        sanitized[field] = sanitizeFunctions(sanitized[field]);
      } else if (Array.isArray(sanitizeFunctions)) {
        sanitized[field] = sanitizeFunctions.reduce(
          (val, fn) => fn(val),
          sanitized[field]
        );
      }
    }
  }

  return sanitized;
};

/**
 * Common schema definitions
 */
const commonSchemas = {
  loginSchema: {
    email: {
      type: 'email',
      required: true,
    },
    password: {
      type: 'string',
      required: true,
      minLength: 8,
    },
  },

  registerSchema: {
    name: {
      type: 'string',
      required: true,
      minLength: 2,
      maxLength: 100,
    },
    email: {
      type: 'email',
      required: true,
    },
    password: {
      type: 'string',
      required: true,
      minLength: 8,
    },
    phone: {
      type: 'phone',
      required: false,
    },
  },

  updateProfileSchema: {
    name: {
      type: 'string',
      required: false,
      minLength: 2,
      maxLength: 100,
    },
    phone: {
      type: 'phone',
      required: false,
    },
    timezone: {
      type: 'string',
      required: false,
      enum: [
        'UTC',
        'Asia/Kolkata',
        'America/New_York',
        'Europe/London',
        'Australia/Sydney',
      ],
    },
  },

  paginationSchema: {
    page: {
      type: 'number',
      required: false,
      min: 1,
    },
    limit: {
      type: 'number',
      required: false,
      min: 1,
      max: 100,
    },
  },

  // ✅ PHASE 2 FIX 4: API Key Validation Schemas
  shopifyApiKeySchema: {
    shopifyApiKey: {
      type: 'string',
      required: true,
      minLength: 32,
      pattern: /^[a-f0-9]{32}$/, // Shopify keys are 32 hex characters
    },
  },

  exotelApiKeySchema: {
    exotelSid: {
      type: 'string',
      required: true,
      minLength: 5,
    },
    exotelToken: {
      type: 'string',
      required: true,
      minLength: 20,
    },
  },

  openaiApiKeySchema: {
    openaiApiKey: {
      type: 'string',
      required: true,
      pattern: /^sk-/, // OpenAI keys start with sk-
      minLength: 20,
    },
  },

  phoneNumberSchema: {
    phoneNumber: {
      type: 'phone',
      required: true,
    },
  },

  urlSchema: {
    url: {
      type: 'url',
      required: true,
    },
  },

  // ✅ PHASE 2 FIX 4: Onboarding complete schema with validation (supports optional Shopify/Exotel)
  onboardingCompleteSchema: {
    companyName: {
      type: 'string',
      required: false,
    },
    skipShopify: {
      type: 'boolean',
      required: false,
    },
    shopifyStore: {
      type: 'url',
      required: false,
    },
    shopifyApiKey: {
      type: 'string',
      required: false,
      minLength: 32,
    },
    shopifyApiSecret: {
      type: 'string',
      required: false,
      minLength: 32,
    },
    skipExotel: {
      type: 'boolean',
      required: false,
    },
    exotelNumber: {
      type: 'phone',
      required: false,
    },
    exotelSid: {
      type: 'string',
      required: false,
      minLength: 5,
    },
    exotelToken: {
      type: 'string',
      required: false,
      minLength: 20,
    },
    returnWindowDays: {
      type: 'number',
      required: false,
      min: 1,
      max: 365,
    },
    refundAutoThreshold: {
      type: 'number',
      required: false,
      min: 0,
    },
    cancelWindowHours: {
      type: 'number',
      required: false,
      min: 0,
    },
    escalationThreshold: {
      type: 'number',
      required: false,
      min: 0,
    },
    enableWhatsApp: {
      type: 'boolean',
      required: false,
    },
    enableSMS: {
      type: 'boolean',
      required: false,
    },
    enableEmail: {
      type: 'boolean',
      required: false,
    },
  },
  
  // ✅ PHASE 3 FIX 2: Settings update schema - ALL fields optional for partial updates
  settingsUpdateSchema: {
    shopifyStore: {
      type: 'url',
      required: false,
    },
    shopifyApiKey: {
      type: 'string',
      required: false,
      minLength: 32,
    },
    shopifyApiSecret: {
      type: 'string',
      required: false,
      minLength: 32,
    },
    exotelNumber: {
      type: 'phone',
      required: false,
    },
    exotelSid: {
      type: 'string',
      required: false,
      minLength: 5,
    },
    exotelToken: {
      type: 'string',
      required: false,
      minLength: 20,
    },
    returnWindowDays: {
      type: 'number',
      required: false,
      min: 1,
      max: 365,
    },
    refundAutoThreshold: {
      type: 'number',
      required: false,
      min: 0,
    },
    cancelWindowHours: {
      type: 'number',
      required: false,
      min: 0,
    },
    escalationThreshold: {
      type: 'number',
      required: false,
      min: 0,
    },
    timezone: {
      type: 'string',
      required: false,
    },
    language: {
      type: 'string',
      required: false,
    },
    enableWhatsApp: {
      type: 'boolean',
      required: false,
    },
    enableSMS: {
      type: 'boolean',
      required: false,
    },
    enableEmail: {
      type: 'boolean',
      required: false,
    },
  },
};

module.exports = {
  // Validator functions
  validators,
  SchemaValidator,

  // Middleware factories
  validateBody,
  validateQuery,
  validateParams,

  // Sanitizers
  sanitizers,
  sanitizeData,

  // Common schemas
  commonSchemas,
};
