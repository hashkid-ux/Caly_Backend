/**
 * Error Handler Middleware Module
 * 
 * Provides centralized error handling for all API endpoints with:
 * - Consistent JSON response formatting
 * - Request tracking via unique IDs
 * - Automatic stack trace sanitization
 * - Environment-aware error details (dev vs prod)
 * - Custom error types for type-safe error handling
 * 
 * @module middleware/errorHandler
 * @requires none
 */

/**
 * Base Application Error Class
 * 
 * Extends Error with HTTP status codes and error codes for API responses.
 * Captures stack trace automatically for debugging.
 * 
 * @class AppError
 * @extends {Error}
 * @param {string} message - Human-readable error message
 * @param {number} statusCode - HTTP status code (200-599)
 * @param {string} [code='INTERNAL_ERROR'] - Machine-readable error code for client handling
 * 
 * @example
 * throw new AppError('Invalid request', 400, 'INVALID_REQUEST');
 */
class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error Class
 * 
 * Used when request data fails validation (400 Bad Request).
 * Includes field-level error details for client feedback.
 * 
 * @class ValidationError
 * @extends {AppError}
 * @param {string} message - Summary of validation failure
 * @param {Object} [details={}] - Field-level error details
 * @param {string} details.field - Field name that failed validation
 * @param {string} details.reason - Reason for validation failure
 * 
 * @example
 * throw new ValidationError('Email is invalid', { 
 *   field: 'email', 
 *   reason: 'Does not match email format' 
 * });
 */
class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * Authentication Error Class
 * 
 * Used when request lacks valid authentication credentials (401 Unauthorized).
 * Does not reveal why authentication failed for security reasons.
 * 
 * @class AuthenticationError
 * @extends {AppError}
 * @param {string} [message='Authentication failed'] - Error message
 * 
 * @example
 * throw new AuthenticationError('Invalid API key');
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization Error Class
 * 
 * Used when authenticated user lacks permission (403 Forbidden).
 * Indicates user identity is valid but action is not allowed.
 * 
 * @class AuthorizationError
 * @extends {AppError}
 * @param {string} [message='Access denied'] - Error message
 * 
 * @example
 * throw new AuthorizationError('Cannot access other user\'s data');
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not Found Error Class
 * 
 * Used when requested resource does not exist (404 Not Found).
 * Automatically formats message with resource type.
 * 
 * @class NotFoundError
 * @extends {AppError}
 * @param {string} [resource='Resource'] - Type of resource not found
 * 
 * @example
 * throw new NotFoundError('User');  // Results in "User not found"
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * Conflict Error Class
 * 
 * Used when request conflicts with existing state (409 Conflict).
 * Common for duplicate resource creation or state conflicts.
 * 
 * @class ConflictError
 * @extends {AppError}
 * @param {string} [message='Resource already exists'] - Error message
 * 
 * @example
 * throw new ConflictError('Email address already registered');
 */
class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Rate Limit Error Class
 * 
 * Used when client exceeds rate limit (429 Too Many Requests).
 * Includes Retry-After information for intelligent client handling.
 * 
 * @class RateLimitError
 * @extends {AppError}
 * @param {number} [retryAfter=60] - Seconds to wait before retrying
 * 
 * @example
 * throw new RateLimitError(120);  // Retry after 2 minutes
 */
class RateLimitError extends AppError {
  constructor(retryAfter = 60) {
    super('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

/**
 * Database Error Class
 * 
 * Used for database operation failures (500 Internal Server Error).
 * Generic message hides database details from clients.
 * 
 * @class DatabaseError
 * @extends {AppError}
 * @param {string} [message='Database operation failed'] - Error message
 * 
 * @example
 * throw new DatabaseError('Cannot insert user: unique constraint violation');
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

/**
 * External Service Error Class
 * 
 * Used when external APIs/services fail (503 Service Unavailable).
 * Tracks which service failed for logging and monitoring.
 * 
 * @class ExternalServiceError
 * @extends {AppError}
 * @param {string} service - Name of external service (e.g., 'Exotel', 'OpenAI')
 * @param {string} message - Error details from external service
 * 
 * @example
 * throw new ExternalServiceError('Exotel', 'Connection timeout after 30s');
 */
class ExternalServiceError extends AppError {
  constructor(service, message) {
    super(`${service} service error: ${message}`, 503, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

/**
 * Generate Unique Request ID
 * 
 * Creates a unique identifier combining timestamp and random string.
 * Used for request tracking across logs and responses.
 * 
 * @function generateRequestId
 * @returns {string} Unique request ID in format 'timestamp-randomstring'
 * 
 * @example
 * const requestId = generateRequestId();
 * // Returns: '1732521234567-a3x9z7b2'
 */
const generateRequestId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Sanitize Error Response
 * 
 * Removes sensitive information from error responses based on environment.
 * In production: hides stack traces and internal details
 * In development: includes full stack trace for debugging
 * 
 * @function sanitizeError
 * @param {AppError} error - Error instance to sanitize
 * @param {boolean} [isDevelopment=false] - Whether to include debug details
 * @returns {Object} Sanitized error response object
 * 
 * @example
 * const response = sanitizeError(error, true);
 * // Returns: { error: { code, message, timestamp, stack } }
 */
const sanitizeError = (error, isDevelopment = false) => {
  const sanitized = {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
      timestamp: error.timestamp || new Date().toISOString(),
    },
  };

  // Include details for validation errors
  if (error.details) {
    sanitized.error.details = error.details;
  }

  // Include retry-after for rate limit errors
  if (error.retryAfter) {
    sanitized.error.retryAfter = error.retryAfter;
  }

  // Include stack trace only in development
  if (isDevelopment && error.stack) {
    sanitized.error.stack = error.stack.split('\n').slice(0, 5);
  }

  return sanitized;
};

/**
 * Main Error Handler Middleware
 * 
 * Centralized error handler for all Express routes.
 * Must be the LAST middleware in the application stack.
 * 
 * Features:
 * - Logs errors with full context (requestId, user, IP, method, path)
 * - Sanitizes responses (removes stack traces in production)
 * - Adds Retry-After header for rate limit errors
 * - Respects custom error types (ValidationError, AuthenticationError, etc.)
 * 
 * @function errorHandler
 * @param {Error} err - Error object (may be AppError or standard Error)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function (unused but required)
 * 
 * @example
 * // Register as last middleware
 * app.use(errorHandler);
 * 
 * // Usage in route handlers
 * app.get('/api/user', asyncHandler(async (req, res) => {
 *   throw new NotFoundError('User');  // Caught by errorHandler
 * }));
 */
const errorHandler = (err, req, res, next) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const requestId = req.requestId || 'unknown';

  // Log error with context
  const errorLog = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    userAgent: req.get('user-agent'),
    ip: req.ip || req.connection.remoteAddress,
    clientId: req.clientId || 'anonymous',
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode: err.statusCode || 500,
    },
  };

  // Log to console in development
  if (isDevelopment) {
    console.error('❌ ERROR:', JSON.stringify(errorLog, null, 2));
  } else {
    console.error(`[${requestId}] Error - ${err.message}`);
  }

  // Determine status code
  const statusCode = err.statusCode || 500;

  // Sanitize error response
  const errorResponse = sanitizeError(err, isDevelopment);

  // Add request ID to response
  errorResponse.error.requestId = requestId;

  // Set response headers
  if (err instanceof RateLimitError) {
    res.set('Retry-After', err.retryAfter);
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Async Error Wrapper Middleware
 * 
 * Wraps async route handlers to catch Promise rejections.
 * Automatically forwards errors to errorHandler middleware.
 * 
 * @function asyncHandler
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped handler that catches errors
 * 
 * @example
 * // Without asyncHandler, thrown errors in async routes won't be caught
 * app.get('/api/data', async (req, res) => {
 *   throw new Error('Oops!');  // Won't be caught
 * });
 * 
 * // With asyncHandler, errors are properly caught
 * app.get('/api/data', asyncHandler(async (req, res) => {
 *   throw new Error('Oops!');  // Caught by errorHandler
 * }));
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Request Context Middleware
 * 
 * Adds request tracking information to each request.
 * Should be the FIRST middleware in the stack.
 * 
 * Adds to req object:
 * - requestId: Unique identifier for request tracking
 * 
 * Logs to console in development mode when request completes.
 * 
 * @function requestContextMiddleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * @example
 * // Register as first middleware
 * app.use(requestContextMiddleware);
 * 
 * // Accessible in all downstream middleware/routes
 * app.get('/api/data', (req, res) => {
 *   console.log(req.requestId);  // '1732521234567-a3x9z7b2'
 * });
 */
const requestContextMiddleware = (req, res, next) => {
  req.requestId = generateRequestId();

  // Track response time
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[${req.requestId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
      );
    }
  });

  next();
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,

  // Middleware
  errorHandler,
  requestContextMiddleware,
  asyncHandler,

  // Utilities
  generateRequestId,
  sanitizeError,
};
