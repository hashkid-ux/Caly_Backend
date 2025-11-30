const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../utils/logger');
const { withTimeout } = require('../utils/timeoutUtil');
const resolve = require('../utils/moduleResolver');

/**
 * Admin Routes - Phase 11
 * System administration, user management, and configuration
 * Requires: Admin role verification
 */

// ===== USER MANAGEMENT =====

/**
 * GET /api/admin/users
 * List all users in client organization
 */
router.get('/users', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { role, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        u.id, u.email, u.name, u.role, u.status,
        u.created_at, u.last_login,
        c.name as company_name
      FROM users u
      JOIN clients c ON u.client_id = c.id
      WHERE u.client_id = $1
    `;
    const params = [client_id];

    if (role) {
      query += ` AND u.role = $${params.length + 1}`;
      params.push(role);
    }
    if (status) {
      query += ` AND u.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await withTimeout(async () => {
      return await db.query(query, params);
    }, 30000, 'fetch users');

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Admin users error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

/**
 * POST /api/admin/users
 * Create new user
 */
router.post('/users', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { email, name, role, password } = req.body;

    if (!email || !name || !role) {
      return res.status(400).json({
        success: false,
        error: 'Email, name, and role required'
      });
    }

    const hashedPassword = require('bcrypt').hashSync(password || 'temp123', 10);

    const result = await withTimeout(async () => {
      return await db.query(
        `INSERT INTO users (client_id, email, name, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id, email, name, role`,
        [client_id, email, name, hashedPassword, role]
      );
    }, 30000, 'create user');

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

/**
 * PUT /api/admin/users/:userId
 * Update user
 */
router.put('/users/:userId', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { userId } = req.params;
    const { role, status, name } = req.body;

    const result = await withTimeout(async () => {
      return await db.query(
        `UPDATE users 
         SET role = COALESCE($1, role),
             status = COALESCE($2, status),
             name = COALESCE($3, name),
             updated_at = NOW()
         WHERE id = $4 AND client_id = $5
         RETURNING id, email, name, role, status`,
        [role, status, name, userId, client_id]
      );
    }, 30000, 'update user');

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Deactivate user
 */
router.delete('/users/:userId', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { userId } = req.params;

    const result = await withTimeout(async () => {
      return await db.query(
        `UPDATE users 
         SET status = 'inactive', updated_at = NOW()
         WHERE id = $1 AND client_id = $2`,
        [userId, client_id]
      );
    }, 30000, 'deactivate user');

    res.json({
      success: true,
      message: 'User deactivated'
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Failed to deactivate user' });
  }
});

// ===== SYSTEM HEALTH =====

/**
 * GET /api/admin/health
 * System health status
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await withTimeout(async () => {
      // Check database
      const dbCheck = await db.query('SELECT NOW()');

      // Check memory
      const memUsage = process.memoryUsage();

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        database: {
          connected: dbCheck.rows.length > 0,
          latency_ms: Date.now()
        },
        memory: {
          heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024)
        },
        version: process.env.APP_VERSION || '3.0.0'
      };
    }, 30000, 'health check');

    res.json({
      success: true,
      data: healthStatus
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

// ===== AUDIT LOG =====

/**
 * GET /api/admin/audit-log
 * User action audit trail
 */
router.get('/audit-log', async (req, res) => {
  try {
    const { client_id } = req.user;
    const { limit = 100, offset = 0, action, user_id } = req.query;

    let query = `
      SELECT 
        id, user_id, action, resource_type, resource_id,
        changes, created_at
      FROM audit_logs
      WHERE client_id = $1
    `;
    const params = [client_id];

    if (action) {
      query += ` AND action = $${params.length + 1}`;
      params.push(action);
    }
    if (user_id) {
      query += ` AND user_id = $${params.length + 1}`;
      params.push(user_id);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await withTimeout(async () => {
      return await db.query(query, params);
    }, 30000, 'fetch audit log');

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Audit log error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit log' });
  }
});

// ===== LICENSE & BILLING =====

/**
 * GET /api/admin/license
 * License and billing information
 */
router.get('/license', async (req, res) => {
  try {
    const { client_id } = req.user;

    const result = await withTimeout(async () => {
      return await db.query(
        `SELECT 
          license_key, license_type, seats_used, max_seats,
          billing_cycle, renewal_date, status, features
         FROM clients
         WHERE id = $1`,
        [client_id]
      );
    }, 30000, 'fetch license');

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'License not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('License check error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch license' });
  }
});

module.exports = router;
