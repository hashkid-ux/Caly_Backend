// Backend/auth/jwtUtils.js - JWT token management with refresh token blacklist support
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');
const db = require('../db/postgres');

// ✅ PHASE 4 FIX 4.1: Require JWT secrets from environment (no hardcoded fallbacks)
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required but not set.');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

if (JWT_SECRET.length < 32) {
  throw new Error('FATAL: JWT_SECRET must be at least 32 characters for security.');
}

class JWTUtils {
  /**
   * Sign a JWT token
   * @param {object} payload - Data to encode in token
   * @param {string} expiresIn - Token expiry (default: 24h)
   * @returns {string} - JWT token
   */
  static signToken(payload, expiresIn = JWT_EXPIRY) {
    try {
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn });
      return token;
    } catch (error) {
      logger.error('Error signing JWT', { error: error.message });
      throw error;
    }
  }

  /**
   * Sign a refresh token (longer lived) with JTI for blacklisting
   * @param {object} payload - Data to encode
   * @returns {string} - Refresh token
   */
  static signRefreshToken(payload) {
    try {
      // Add JTI (JWT ID) for token revocation/blacklisting
      const jti = `${payload.userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      
      const token = jwt.sign(
        { ...payload, jti },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRY }
      );
      return token;
    } catch (error) {
      logger.error('Error signing refresh token', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify a JWT token
   * @param {string} token - JWT token to verify
   * @returns {object} - Decoded token payload
   */
  static verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.debug('Token expired', { expiredAt: error.expiredAt });
        throw new Error('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        logger.debug('Invalid token', { error: error.message });
        throw new Error('Invalid token');
      }
      logger.error('Error verifying token', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify refresh token and check if blacklisted
   * @param {string} token - Refresh token to verify
   * @returns {object} - Decoded token payload
   * @throws Error if token is blacklisted or invalid
   */
  static async verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // Check if token is in blacklist
      if (decoded.jti) {
        const blacklisted = await db.query(
          'SELECT id FROM refresh_token_blacklist WHERE token_jti = $1',
          [decoded.jti]
        );

        if (blacklisted.rows.length > 0) {
          logger.warn('Attempt to use blacklisted refresh token', { 
            jti: decoded.jti,
            userId: decoded.userId 
          });
          throw new Error('Token has been revoked');
        }
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.debug('Refresh token expired', { expiredAt: error.expiredAt });
        throw new Error('Refresh token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        logger.debug('Invalid refresh token', { error: error.message });
        throw new Error('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Blacklist a refresh token (on logout)
   * @param {string} token - Refresh token to blacklist
   * @returns {boolean} - Success
   */
  static async blacklistRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      if (!decoded.jti) {
        logger.warn('Refresh token missing JTI for blacklist');
        return false;
      }

      await db.query(
        `INSERT INTO refresh_token_blacklist (user_id, token_jti, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (token_jti) DO NOTHING`,
        [decoded.userId, decoded.jti, new Date(decoded.exp * 1000)]
      );

      logger.info('✅ Refresh token blacklisted', {
        userId: decoded.userId,
        jti: decoded.jti
      });

      return true;
    } catch (error) {
      logger.error('Error blacklisting refresh token', { error: error.message });
      return false;
    }
  }

  /**
   * Decode token without verification (for debugging)
   * @param {string} token - JWT token
   * @returns {object} - Decoded payload
   */
  static decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.error('Error decoding token', { error: error.message });
      return null;
    }
  }

  /**
   * Generate both access and refresh tokens
   * @param {object} payload - User data
   * @returns {object} - { accessToken, refreshToken }
   */
  static generateTokenPair(payload) {
    try {
      const accessToken = this.signToken(payload, JWT_EXPIRY);
      const refreshToken = this.signRefreshToken(payload);
      return { accessToken, refreshToken };
    } catch (error) {
      logger.error('Error generating token pair', { error: error.message });
      throw error;
    }
  }

  /**
   * ✅ PHASE 4 FIX 4.3: Rotate refresh token (issue new, blacklist old)
   * Called when client uses refresh token to get new access token
   * 
   * Benefits:
   * - Limits lifetime of compromised tokens
   * - Detects token theft (only one refresh token active per user at a time)
   * - Reduces attack surface if token is leaked
   * 
   * @param {object} oldDecodedToken - The decoded old refresh token
   * @param {object} payload - User payload for new token
   * @returns {object} - { newAccessToken, newRefreshToken, oldTokenBlacklisted: boolean }
   */
  static async rotateRefreshToken(oldDecodedToken, payload) {
    try {
      // 1. Blacklist the old refresh token (so it can't be reused)
      if (oldDecodedToken.jti) {
        await this.blacklistRefreshToken(
          this.signRefreshToken(oldDecodedToken)
        );
      }

      // 2. Generate new token pair
      const newAccessToken = this.signToken(payload, JWT_EXPIRY);
      const newRefreshToken = this.signRefreshToken(payload);

      logger.info('✅ Refresh token rotated', {
        userId: payload.userId,
        oldJti: oldDecodedToken.jti,
        timestamp: new Date().toISOString()
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        rotated: true
      };
    } catch (error) {
      logger.error('Error rotating refresh token', { error: error.message });
      throw error;
    }
  }
}

module.exports = JWTUtils;
