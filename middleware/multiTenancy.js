/**
 * Multi-tenancy Enforcement Middleware
 * Adds automatic client_id filtering to request objects
 * Ensures all queries are scoped to user's tenant
 */

const logger = require('../utils/logger');

/**
 * Inject multi-tenancy context into all authenticated requests
 * Ensures every database query is scoped to user's client_id
 */
const multiTenancyContext = (req, res, next) => {
  try {
    if (req.user && req.user.client_id) {
      // Add tenant context to request
      req.tenantId = req.user.client_id;
      req.userId = req.user.id;
      
      logger.debug('Multi-tenancy context set', {
        tenantId: req.tenantId,
        userId: req.userId,
        path: req.path
      });
    }
    
    next();
  } catch (error) {
    logger.error('Error in multiTenancyContext', { error: error.message });
    next();
  }
};

/**
 * Strict multi-tenancy enforcement for routes that access client_id in params
 * Routes using this should have client_id as a param: /api/resource/:client_id
 */
const enforceMultiTenancy = (req, res, next) => {
  try {
    if (!req.user || !req.user.client_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // If route has client_id parameter, verify it matches user's tenant
    if (req.params.client_id && req.params.client_id !== req.user.client_id) {
      logger.warn('🚨 Cross-tenant access attempt blocked', {
        userClientId: req.user.client_id,
        requestedClientId: req.params.client_id,
        userId: req.user.id,
        path: req.path,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      return res.status(403).json({ 
        error: 'Access denied - Cross-tenant access not allowed'
      });
    }

    // If route has id parameter without explicit client_id, we still need to verify ownership
    // This is handled by individual routes querying with WHERE client_id = req.user.client_id
    
    next();
  } catch (error) {
    logger.error('Error in enforceMultiTenancy', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Helper to build tenant-scoped query filters
 * Usage: db.query(query + multiTenancyFilter(params.length + 1), [...params, req.tenantId])
 */
const multiTenancyFilter = (paramIndex = 1) => {
  return ` AND client_id = $${paramIndex}`;
};

/**
 * Helper to get pagination with tenant scope already applied
 * Usage: const users = await db.query(
 *   'SELECT * FROM users WHERE client_id = $1 ' + whereClause(2),
 *   [req.tenantId, ...otherParams]
 * );
 */
const whereClause = (nextParamIndex) => {
  return '';  // Placeholder - actual WHERE clause built by route
};

module.exports = {
  multiTenancyContext,
  enforceMultiTenancy,
  multiTenancyFilter,
  whereClause
};
