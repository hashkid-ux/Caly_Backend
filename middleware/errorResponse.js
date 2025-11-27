/**
 * Error Response Standardization
 * 🔒 PHASE 2 FIX 2.2: Unified error format across all endpoints
 * 
 * All errors follow consistent format:
 * {
 *   error: "User-friendly message",
 *   code: "ERROR_CODE",
 *   requestId: "req-id-123",
 *   timestamp: "2025-01-15T10:30:00Z"
 *   // Additional context in development
 *   ...(process.env.NODE_ENV !== 'production' && { details: {...} })
 * }
 */

const logger = require('../utils/logger');

/**
 * Standard error codes
 */
const ERROR_CODES = {
  // Authentication (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  MISSING_CREDENTIALS: 'MISSING_CREDENTIALS',

  // Authorization (403)
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  MULTI_TENANCY_VIOLATION: 'MULTI_TENANCY_VIOLATION',

  // Client Errors (400)
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_INPUT: 'INVALID_INPUT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Not Found (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',

  // Conflict (409)
  CONFLICT: 'CONFLICT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  STATE_CONFLICT: 'STATE_CONFLICT',

  // Rate Limit (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // Server Errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR'
};

/**
 * Standard error response builder
 */
class StandardError extends Error {
  constructor(message, code = ERROR_CODES.INTERNAL_ERROR, statusCode = 500, details = null) {
    super(message);
    this.name = 'StandardError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Convert to response format
   */
  toResponse(requestId) {
    const response = {
      error: this.message,
      code: this.code,
      requestId: requestId || 'unknown',
      timestamp: this.timestamp
    };

    // Include details in development
    if (process.env.NODE_ENV !== 'production' && this.details) {
      response.details = this.details;
    }

    return response;
  }
}

/**
 * Error response middleware
 * Catches all errors and returns standardized format
 */
function errorResponseMiddleware(err, req, res, next) {
  const requestId = req.requestId || 'unknown';

  // Convert to StandardError if needed
  let error = err;
  if (!(err instanceof StandardError)) {
    // Map common error types to StandardError
    if (err.name === 'ValidationError') {
      error = new StandardError(
        'Request validation failed',
        ERROR_CODES.VALIDATION_ERROR,
        400,
        { fields: err.errors }
      );
    } else if (err.name === 'JsonWebTokenError') {
      error = new StandardError(
        'Invalid authentication token',
        ERROR_CODES.INVALID_TOKEN,
        401
      );
    } else if (err.name === 'TokenExpiredError') {
      error = new StandardError(
        'Authentication token has expired',
        ERROR_CODES.TOKEN_EXPIRED,
        401
      );
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      error = new StandardError(
        'External service unavailable',
        ERROR_CODES.EXTERNAL_SERVICE_ERROR,
        503
      );
    } else if (err.message && err.message.includes('timeout')) {
      error = new StandardError(
        'Request timeout',
        ERROR_CODES.TIMEOUT,
        504
      );
    } else {
      error = new StandardError(
        err.message || 'Internal server error',
        ERROR_CODES.INTERNAL_ERROR,
        err.statusCode || 500,
        process.env.NODE_ENV !== 'production' ? { originalError: err.message } : null
      );
    }
  }

  // Log error
  const logLevel = error.statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel](`${error.statusCode} ${error.code}`, {
    message: error.message,
    code: error.code,
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.user?.id,
    details: error.details,
    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
  });

  // Return standardized response
  res.status(error.statusCode).json(error.toResponse(requestId));
}

/**
 * Helper to throw standard errors in route handlers
 */
function throwError(message, code = ERROR_CODES.BAD_REQUEST, statusCode = 400, details = null) {
  throw new StandardError(message, code, statusCode, details);
}

/**
 * Helper to safely handle async route handlers
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error helper
 */
function validationError(message, fields = null) {
  return new StandardError(
    message || 'Validation failed',
    ERROR_CODES.VALIDATION_ERROR,
    400,
    { fields }
  );
}

/**
 * Authentication error helper
 */
function authenticationError(message = 'Authentication required') {
  return new StandardError(
    message,
    ERROR_CODES.UNAUTHORIZED,
    401
  );
}

/**
 * Authorization error helper
 */
function authorizationError(message = 'Insufficient permissions') {
  return new StandardError(
    message,
    ERROR_CODES.FORBIDDEN,
    403
  );
}

/**
 * Not found error helper
 */
function notFoundError(resource = 'Resource') {
  return new StandardError(
    `${resource} not found`,
    ERROR_CODES.NOT_FOUND,
    404
  );
}

/**
 * Conflict error helper
 */
function conflictError(message, code = ERROR_CODES.CONFLICT) {
  return new StandardError(
    message,
    code,
    409
  );
}

/**
 * Rate limit error helper
 */
function rateLimitError(retryAfter = 60) {
  const error = new StandardError(
    'Too many requests. Please try again later.',
    ERROR_CODES.RATE_LIMIT_EXCEEDED,
    429
  );
  error.retryAfter = retryAfter;
  return error;
}

/**
 * Service unavailable error helper
 */
function serviceUnavailableError(service = 'Service') {
  return new StandardError(
    `${service} is temporarily unavailable`,
    ERROR_CODES.SERVICE_UNAVAILABLE,
    503
  );
}

module.exports = {
  StandardError,
  ERROR_CODES,
  errorResponseMiddleware,
  throwError,
  asyncHandler,
  validationError,
  authenticationError,
  authorizationError,
  notFoundError,
  conflictError,
  rateLimitError,
  serviceUnavailableError
};
