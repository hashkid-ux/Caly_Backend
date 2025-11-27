/**
 * API Response Standardization
 * Ensures all API responses follow same format
 * Makes frontend integration predictable and reliable
 * 
 * Usage:
 *   const { sendSuccess, sendError } = require('./apiResponse');
 *   sendSuccess(res, 200, { data: call }, 'Call retrieved successfully');
 *   sendError(res, 404, 'NOT_FOUND', 'Call not found');
 */

/**
 * Standard success response format
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code (200, 201, etc)
 * @param {*} data - Response data/payload
 * @param {string} message - Optional success message
 * @param {Object} metadata - Optional pagination/metadata
 */
function sendSuccess(res, statusCode, data, message = null, metadata = null) {
  const response = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId: res.locals?.requestId || null,
  };

  if (message) {
    response.message = message;
  }

  if (metadata) {
    response.pagination = metadata;
  }

  return res.status(statusCode).json(response);
}

/**
 * Standard error response format
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code (400, 404, 500, etc)
 * @param {string} code - Error code (NOT_FOUND, UNAUTHORIZED, etc)
 * @param {string} message - Human-readable error message
 * @param {Object} details - Optional additional error details
 */
function sendError(res, statusCode, code, message, details = null) {
  const response = {
    success: false,
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
      requestId: res.locals?.requestId || null,
    },
  };

  if (details) {
    response.error.details = details;
  }

  return res.status(statusCode).json(response);
}

/**
 * Created (201) response
 * @param {Object} res - Express response object
 * @param {*} data - Created resource
 * @param {string} message - Optional message
 */
function sendCreated(res, data, message = 'Resource created successfully') {
  return sendSuccess(res, 201, data, message);
}

/**
 * Accepted (202) response for async operations
 * @param {Object} res - Express response object
 * @param {Object} data - Operation info
 * @param {string} message - Optional message
 */
function sendAccepted(res, data, message = 'Request accepted and processing') {
  return sendSuccess(res, 202, data, message);
}

/**
 * Bad Request (400) error
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Object} details - Validation errors, etc
 */
function sendBadRequest(res, message, details = null) {
  return sendError(res, 400, 'BAD_REQUEST', message, details);
}

/**
 * Unauthorized (401) error
 * @param {Object} res - Express response object
 * @param {string} message - Error message (default provided)
 */
function sendUnauthorized(res, message = 'Authentication required') {
  return sendError(res, 401, 'UNAUTHORIZED', message);
}

/**
 * Forbidden (403) error
 * @param {Object} res - Express response object
 * @param {string} message - Error message (default provided)
 */
function sendForbidden(res, message = 'Access denied') {
  return sendError(res, 403, 'FORBIDDEN', message);
}

/**
 * Not Found (404) error
 * @param {Object} res - Express response object
 * @param {string} resourceType - What wasn't found (call, user, etc)
 */
function sendNotFound(res, resourceType = 'Resource') {
  return sendError(res, 404, 'NOT_FOUND', `${resourceType} not found`);
}

/**
 * Conflict (409) error
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
function sendConflict(res, message) {
  return sendError(res, 409, 'CONFLICT', message);
}

/**
 * Too Many Requests (429) error
 * @param {Object} res - Express response object
 * @param {number} retryAfter - Seconds to wait before retry
 */
function sendTooManyRequests(res, retryAfter = 60) {
  res.set('Retry-After', retryAfter);
  return sendError(res, 429, 'RATE_LIMITED', `Too many requests. Retry after ${retryAfter}s`);
}

/**
 * Internal Server Error (500)
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Object} details - Error details (development only)
 */
function sendInternalError(res, message = 'Internal server error', details = null) {
  return sendError(res, 500, 'INTERNAL_ERROR', message, details);
}

/**
 * Service Unavailable (503) error
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
function sendUnavailable(res, message = 'Service temporarily unavailable') {
  return sendError(res, 503, 'SERVICE_UNAVAILABLE', message);
}

/**
 * List response with pagination
 * @param {Object} res - Express response object
 * @param {Array} items - List of items
 * @param {Object} paginationMetadata - From pagination.getMetadata()
 * @param {string} message - Optional message
 */
function sendList(res, items, paginationMetadata, message = null) {
  const response = {
    success: true,
    data: items,
    pagination: paginationMetadata,
    timestamp: new Date().toISOString(),
    requestId: res.locals?.requestId || null,
  };

  if (message) {
    response.message = message;
  }

  return res.status(200).json(response);
}

module.exports = {
  sendSuccess,
  sendError,
  sendCreated,
  sendAccepted,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendConflict,
  sendTooManyRequests,
  sendInternalError,
  sendUnavailable,
  sendList,
};
