// db/postgres.js - PostgreSQL connection manager
const { Pool } = require('pg');
const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

// Support both Railway (DATABASE_URL) and local development (individual DB_* vars)
const getPoolConfig = () => {
  if (process.env.DATABASE_URL) {
    // Railway environment - use full connection string
    return {
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };
  }
  // Local development - use individual variables
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'caly_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
};

const pool = new Pool(getPoolConfig());

// Test connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection test successful', { 
      timestamp: result.rows[0].now 
    });
    return true;
  } catch (error) {
    logger.error('Database connection test failed', { 
      error: error.message 
    });
    throw error;
  }
};

// Query helper with error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { 
      query: text.substring(0, 100), 
      duration,
      rows: result.rowCount 
    });
    return result;
  } catch (error) {
    logger.error('Query error', { 
      error: error.message, 
      query: text.substring(0, 100) 
    });
    throw error;
  }
};

// Call database operations
const calls = {
  // Create new call record
  create: async (data) => {
    const { client_id, call_sid, phone_from, phone_to } = data;
    const result = await query(
      `INSERT INTO calls (client_id, call_sid, phone_from, phone_to) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [client_id, call_sid, phone_from, phone_to]
    );
    return result.rows[0];
  },

  // Update call record
  update: async (id, data) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(data).forEach(key => {
      fields.push(`${key} = $${paramIndex}`);
      values.push(data[key]);
      paramIndex++;
    });

    values.push(id);
    const result = await query(
      `UPDATE calls SET ${fields.join(', ')}, updated_at = NOW() 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      values
    );
    return result.rows[0];
  },

  // Get call by ID
  getById: async (id) => {
    const result = await query('SELECT * FROM calls WHERE id = $1', [id]);
    return result.rows[0];
  },

  // Get calls by client
  getByClient: async (clientId, limit = 100, offset = 0) => {
    const result = await query(
      `SELECT * FROM calls 
       WHERE client_id = $1 
       ORDER BY start_ts DESC 
       LIMIT $2 OFFSET $3`,
      [clientId, limit, offset]
    );
    return result.rows;
  },

  // End call and mark resolved
  end: async (id, transcript, resolved = false) => {
    const result = await query(
      `UPDATE calls 
       SET end_ts = NOW(), transcript_full = $2, resolved = $3, updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id, transcript, resolved]
    );
    return result.rows[0];
  }
};

// Action database operations
const actions = {
  // Create new action
  create: async (data) => {
    const { call_id, action_type, params, confidence } = data;
    const result = await query(
      `INSERT INTO actions (call_id, action_type, params, confidence, status) 
       VALUES ($1, $2, $3, $4, 'pending') 
       RETURNING *`,
      [call_id, action_type, JSON.stringify(params), confidence]
    );
    return result.rows[0];
  },

  // Update action status and result
  updateStatus: async (id, status, result) => {
    const resultQuery = await query(
      `UPDATE actions 
       SET status = $2, result = $3, updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id, status, JSON.stringify(result)]
    );
    return resultQuery.rows[0];
  },

  // Get actions by call
  getByCall: async (callId) => {
    const result = await query(
      `SELECT * FROM actions WHERE call_id = $1 ORDER BY created_at`,
      [callId]
    );
    return result.rows;
  }
};

// Entity database operations
const entities = {
  // Create new entity
  create: async (data) => {
    const { call_id, entity_type, value, confidence } = data;
    const result = await query(
      `INSERT INTO entities (call_id, entity_type, value, confidence) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [call_id, entity_type, value, confidence]
    );
    return result.rows[0];
  },

  // Get entities by call
  getByCall: async (callId) => {
    const result = await query(
      `SELECT * FROM entities WHERE call_id = $1`,
      [callId]
    );
    return result.rows;
  }
};

// Client operations
const clients = {
  // Get client by ID
  getById: async (id) => {
    const result = await query('SELECT * FROM clients WHERE id = $1', [id]);
    return result.rows[0];
  },

  // Get all active clients
  getActive: async () => {
    const result = await query('SELECT * FROM clients WHERE active = true');
    return result.rows;
  }
};

// Audit log
const auditLog = async (data) => {
  const { call_id, client_id, event_type, payload, user_id, ip_address } = data;
  await query(
    `INSERT INTO audit_logs (call_id, client_id, event_type, payload, user_id, ip_address) 
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [call_id, client_id, event_type, JSON.stringify(payload), user_id, ip_address]
  );
};

// Close pool
const close = async () => {
  await pool.end();
  logger.info('Database pool closed');
};

module.exports = {
  query,
  testConnection,
  calls,
  actions,
  entities,
  clients,
  auditLog,
  close,
  pool
};