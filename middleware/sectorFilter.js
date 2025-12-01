// Backend/middleware/sectorFilter.js - Sector-based data filtering middleware

const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));

/**
 * Middleware to add sector filtering to all requests
 * Attaches user's sector to req for queries to filter by
 */
const sectorFilterMiddleware = async (req, res, next) => {
  try {
    if (!req.user || !req.user.client_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch user's sector from database
    const result = await db.query(
      'SELECT sector FROM clients WHERE client_id = $1',
      [req.user.client_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const userSector = result.rows[0].sector || 'ecommerce';
    
    // Attach sector to request object
    req.userSector = userSector;
    req.user.sector = userSector;

    logger.debug(`Sector filter applied: ${userSector} for client ${req.user.client_id}`);
    next();
  } catch (err) {
    logger.error('Sector filter middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { sectorFilterMiddleware };
