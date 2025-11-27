// Backend/auth/authMiddleware.js - Protect routes and enforce multi-tenancy
const logger = require('../utils/logger');
const JWTUtils = require('./jwtUtils');

/**
 * Verify JWT token and attach user to request
 * Enforces multi-tenancy: user can only access their own client_id
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Missing or invalid authorization header' 
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify token
    const decoded = JWTUtils.verifyToken(token);

    // Attach user to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      client_id: decoded.client_id,
      role: decoded.role,
      companyName: decoded.companyName
    };

    logger.debug('Auth verified', { 
      userId: req.user.id,
      client_id: req.user.client_id 
    });

    next();

  } catch (error) {
    logger.warn('Auth verification failed', { 
      error: error.message,
      ip: req.ip 
    });

    if (error.message === 'Token expired') {
      return res.status(401).json({ error: 'Token expired. Please refresh.' });
    }

    res.status(401).json({ error: 'Unauthorized' });
  }
};

/**
 * Validate that user can only access their own data
 * Use in routes like GET /api/calls/:id to verify ownership
 */
const enforceClientAccess = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // For routes with client_id in params, verify ownership
    if (req.params.client_id && req.params.client_id !== req.user.client_id) {
      logger.warn('Cross-company access attempt', {
        user_client_id: req.user.client_id,
        requested_client_id: req.params.client_id,
        userId: req.user.id,
        ip: req.ip
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    next();

  } catch (error) {
    logger.error('Error in enforceClientAccess', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Require specific role (admin, manager, viewer)
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Insufficient permissions', {
        userId: req.user.id,
        requiredRole: allowedRoles,
        userRole: req.user.role,
        ip: req.ip
      });
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Optional auth - doesn't fail if no token, just checks if valid
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = JWTUtils.verifyToken(token);
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        client_id: decoded.client_id,
        role: decoded.role
      };
    }
    next();
  } catch (error) {
    // Silent fail - continue without auth
    next();
  }
};

module.exports = {
  authMiddleware,
  enforceClientAccess,
  requireRole,
  optionalAuth
};
