/**
 * Audit Logging Service
 * Tracks all sensitive operations for compliance, debugging, and security
 * Events logged: authentication, authorization, data access, modifications, errors
 */

const db = require('../db/postgres');
const logger = require('../utils/logger');

/**
 * Audit event types
 */
const AuditEventType = {
  // Authentication events
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_DISABLED: 'MFA_DISABLED',

  // Authorization events
  ACCESS_GRANTED: 'ACCESS_GRANTED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  PERMISSION_CHANGED: 'PERMISSION_CHANGED',

  // Data events
  DATA_ACCESSED: 'DATA_ACCESSED',
  DATA_CREATED: 'DATA_CREATED',
  DATA_UPDATED: 'DATA_UPDATED',
  DATA_DELETED: 'DATA_DELETED',
  DATA_EXPORTED: 'DATA_EXPORTED',

  // Integration events
  INTEGRATION_CONNECTED: 'INTEGRATION_CONNECTED',
  INTEGRATION_DISCONNECTED: 'INTEGRATION_DISCONNECTED',
  INTEGRATION_FAILED: 'INTEGRATION_FAILED',
  API_KEY_GENERATED: 'API_KEY_GENERATED',
  API_KEY_REVOKED: 'API_KEY_REVOKED',

  // Admin events
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_DELETED: 'USER_DELETED',
  ADMIN_ACTION: 'ADMIN_ACTION',

  // Error events
  ERROR_OCCURRED: 'ERROR_OCCURRED',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // System events
  SYSTEM_HEALTH_CHECK: 'SYSTEM_HEALTH_CHECK',
  BACKUP_STARTED: 'BACKUP_STARTED',
  BACKUP_COMPLETED: 'BACKUP_COMPLETED',
};

/**
 * Audit severity levels
 */
const AuditSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

/**
 * Get severity level for event type
 */
const getSeverity = (eventType) => {
  const criticalEvents = [
    AuditEventType.LOGIN_FAILURE,
    AuditEventType.ACCESS_DENIED,
    AuditEventType.DATA_DELETED,
    AuditEventType.SECURITY_VIOLATION,
    AuditEventType.USER_SUSPENDED,
    AuditEventType.API_KEY_REVOKED,
  ];

  const highEvents = [
    AuditEventType.LOGIN_SUCCESS,
    AuditEventType.PASSWORD_CHANGE,
    AuditEventType.PERMISSION_CHANGED,
    AuditEventType.INTEGRATION_CONNECTED,
    AuditEventType.SETTINGS_CHANGED,
    AuditEventType.DATA_UPDATED,
  ];

  if (criticalEvents.includes(eventType)) return AuditSeverity.CRITICAL;
  if (highEvents.includes(eventType)) return AuditSeverity.HIGH;
  return AuditSeverity.MEDIUM;
};

/**
 * Log audit event to database
 */
const logAuditEvent = async (
  eventType,
  {
    clientId = null,
    userId = null,
    description = '',
    resource = null,
    resourceId = null,
    changes = null,
    ipAddress = null,
    userAgent = null,
    requestId = null,
    status = 'SUCCESS',
    metadata = {},
  } = {}
) => {
  try {
    const severity = getSeverity(eventType);

    const query = `
      INSERT INTO audit_logs 
      (event_type, client_id, user_id, description, resource, resource_id, changes, 
       ip_address, user_agent, request_id, status, severity, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING id, created_at;
    `;

    const values = [
      eventType,
      clientId,
      userId,
      description,
      resource,
      resourceId,
      changes ? JSON.stringify(changes) : null,
      ipAddress,
      userAgent,
      requestId,
      status,
      severity,
      Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
    ];

    const result = await db.query(query, values);

    // Log critical/high severity events to console
    if (severity === AuditSeverity.CRITICAL || severity === AuditSeverity.HIGH) {
      logger.warn(`[AUDIT-${eventType}] ${description}`, {
        clientId,
        userId,
        requestId,
        severity,
      });
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Failed to log audit event', {
      error: error.message,
      eventType,
      clientId: arguments[1]?.clientId,
    });
    // Don't throw - audit failure shouldn't crash the app
  }
};

/**
 * Query audit logs with filtering
 */
const queryAuditLogs = async (
  {
    clientId = null,
    userId = null,
    eventType = null,
    status = null,
    startDate = null,
    endDate = null,
    resourceType = null,
    severity = null,
  } = {},
  { page = 1, limit = 100 } = {}
) => {
  try {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (clientId) {
      query += ` AND client_id = $${paramCount}`;
      values.push(clientId);
      paramCount++;
    }

    if (userId) {
      query += ` AND user_id = $${paramCount}`;
      values.push(userId);
      paramCount++;
    }

    if (eventType) {
      query += ` AND event_type = $${paramCount}`;
      values.push(eventType);
      paramCount++;
    }

    if (status) {
      query += ` AND status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    if (severity) {
      query += ` AND severity = $${paramCount}`;
      values.push(severity);
      paramCount++;
    }

    if (resourceType) {
      query += ` AND resource = $${paramCount}`;
      values.push(resourceType);
      paramCount++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramCount}`;
      values.push(new Date(startDate));
      paramCount++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramCount}`;
      values.push(new Date(endDate));
      paramCount++;
    }

    // Add ordering and pagination
    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, (page - 1) * limit);

    const result = await db.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('Failed to query audit logs', { error: error.message });
    return [];
  }
};

/**
 * Get audit statistics
 */
const getAuditStats = async (clientId) => {
  try {
    const query = `
      SELECT 
        event_type,
        severity,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'FAILURE' THEN 1 END) as failure_count
      FROM audit_logs
      WHERE client_id = $1
      AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY event_type, severity
      ORDER BY count DESC;
    `;

    const result = await db.query(query, [clientId]);
    return result.rows;
  } catch (error) {
    logger.error('Failed to get audit statistics', { error: error.message });
    return [];
  }
};

/**
 * Audit middleware - logs all requests
 */
const auditMiddleware = (req, res, next) => {
  // Skip logging for health checks and static files
  if (req.path.includes('/health') || req.path.includes('/static')) {
    return next();
  }

  // Store original send function
  const originalSend = res.send;

  // Intercept response
  res.send = function (data) {
    // Log request/response details
    if (req.clientId) {
      logAuditEvent(AuditEventType.DATA_ACCESSED, {
        clientId: req.clientId,
        userId: req.userId,
        description: `${req.method} ${req.path}`,
        resource: req.baseUrl.split('/')[1],
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.requestId,
        status: res.statusCode >= 400 ? 'FAILURE' : 'SUCCESS',
        metadata: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseSize: data ? data.length : 0,
        },
      });
    }

    // Call original send
    return originalSend.call(this, data);
  };

  next();
};

/**
 * Log authentication event
 */
const logAuthEvent = (success, { clientId, userId, email, ipAddress, userAgent, requestId }) => {
  return logAuditEvent(success ? AuditEventType.LOGIN_SUCCESS : AuditEventType.LOGIN_FAILURE, {
    clientId,
    userId,
    description: success ? `User logged in: ${email}` : `Login failed: ${email}`,
    ipAddress,
    userAgent,
    requestId,
    status: success ? 'SUCCESS' : 'FAILURE',
  });
};

/**
 * Log data modification
 */
const logDataModification = (action, { clientId, userId, resource, resourceId, changes, requestId }) => {
  const eventTypeMap = {
    create: AuditEventType.DATA_CREATED,
    update: AuditEventType.DATA_UPDATED,
    delete: AuditEventType.DATA_DELETED,
  };

  return logAuditEvent(eventTypeMap[action] || AuditEventType.DATA_UPDATED, {
    clientId,
    userId,
    description: `${action} ${resource}`,
    resource,
    resourceId,
    changes,
    requestId,
    status: 'SUCCESS',
  });
};

/**
 * Log security event
 */
const logSecurityEvent = (eventType, { clientId, userId, description, ipAddress, userAgent, requestId }) => {
  return logAuditEvent(eventType, {
    clientId,
    userId,
    description,
    ipAddress,
    userAgent,
    requestId,
    status: 'SECURITY_ALERT',
  });
};

module.exports = {
  // Constants
  AuditEventType,
  AuditSeverity,

  // Core functions
  logAuditEvent,
  queryAuditLogs,
  getAuditStats,

  // Specific logging functions
  logAuthEvent,
  logDataModification,
  logSecurityEvent,

  // Middleware
  auditMiddleware,

  // Utilities
  getSeverity,
};
