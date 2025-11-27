const { v4: uuidv4 } = require('uuid');

/**
 * Request ID Middleware
 * Generates unique ID for each request
 * Allows correlation across logs, metrics, and distributed tracing
 * 
 * Usage in server.js:
 *   app.use(requestIdMiddleware);
 * 
 * Access in routes/middleware:
 *   const requestId = req.requestId;
 */

/**
 * Middleware function to add request ID to request object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function requestIdMiddleware(req, res, next) {
  // Check if request ID already exists (from upstream proxy/load balancer)
  const existingId = 
    req.get('x-request-id') || 
    req.get('x-correlation-id') ||
    req.get('x-trace-id');
  
  // Use existing ID or generate new one
  req.requestId = existingId || uuidv4();
  
  // Add to response headers for client tracking
  res.set('x-request-id', req.requestId);
  res.set('x-correlation-id', req.requestId);
  
  // Store in locals for easy access in templates/logs
  res.locals.requestId = req.requestId;

  // Log request with ID
  if (req.method !== 'OPTIONS') {
    console.log(`[${req.requestId}] ${req.method} ${req.path}`);
  }

  next();
}

module.exports = requestIdMiddleware;
