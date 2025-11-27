/**
 * ✅ PHASE 4 FIX 4.2: Database Cleanup Service
 * 
 * Purpose: Periodically clean up expired authentication data
 * - Remove expired OTP codes
 * - Remove expired password reset tokens
 * - Remove expired refresh token blacklist entries
 * - Log cleanup statistics for monitoring
 */

const db = require('../db/postgres');
const logger = require('../utils/logger');

class CleanupService {
  /**
   * Clean up expired OTP codes
   * Removes: OTP codes where otp_expires_at < NOW()
   */
  static async cleanupExpiredOTP() {
    try {
      const result = await db.query(
        `DELETE FROM users 
         WHERE otp_code IS NOT NULL 
         AND otp_expires_at < NOW()
         RETURNING id`
      );

      const count = result.rowCount;
      if (count > 0) {
        logger.info('✅ OTP Cleanup: Removed expired codes', { 
          count,
          timestamp: new Date().toISOString()
        });
      }
      return { success: true, cleaned: count };
    } catch (error) {
      logger.error('❌ OTP Cleanup failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up expired password reset tokens
   * Removes: Tokens where expires_at < NOW() OR used_at IS NOT NULL (already used)
   */
  static async cleanupPasswordResetTokens() {
    try {
      const result = await db.query(
        `DELETE FROM password_reset_tokens 
         WHERE expires_at < NOW() 
         OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '24 hours')
         RETURNING id`
      );

      const count = result.rowCount;
      if (count > 0) {
        logger.info('✅ Password Reset Cleanup: Removed expired tokens', { 
          count,
          timestamp: new Date().toISOString()
        });
      }
      return { success: true, cleaned: count };
    } catch (error) {
      logger.error('❌ Password Reset Cleanup failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up expired refresh token blacklist entries
   * Removes: Tokens where expires_at < NOW() (token itself is no longer usable)
   */
  static async cleanupBlacklistedTokens() {
    try {
      const result = await db.query(
        `DELETE FROM refresh_token_blacklist 
         WHERE expires_at < NOW()
         RETURNING id`
      );

      const count = result.rowCount;
      if (count > 0) {
        logger.info('✅ Token Blacklist Cleanup: Removed expired entries', { 
          count,
          timestamp: new Date().toISOString()
        });
      }
      return { success: true, cleaned: count };
    } catch (error) {
      logger.error('❌ Token Blacklist Cleanup failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Run all cleanup operations
   * Useful for scheduled jobs or manual triggers
   */
  static async cleanupAll() {
    try {
      logger.info('🧹 Starting database cleanup...');

      const results = {
        otp: await this.cleanupExpiredOTP(),
        passwordReset: await this.cleanupPasswordResetTokens(),
        blacklistedTokens: await this.cleanupBlacklistedTokens(),
      };

      const totalCleaned = 
        (results.otp.cleaned || 0) + 
        (results.passwordReset.cleaned || 0) + 
        (results.blacklistedTokens.cleaned || 0);

      logger.info('✅ Database cleanup completed', { 
        totalCleaned,
        details: results,
        timestamp: new Date().toISOString()
      });

      return { 
        success: true, 
        totalCleaned,
        details: results
      };
    } catch (error) {
      logger.error('❌ Database cleanup failed', { error: error.message });
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Get cleanup statistics
   * Returns: Count of expired records in each table
   */
  static async getCleanupStats() {
    try {
      const stats = {};

      // Count expired OTPs
      const otpResult = await db.query(
        `SELECT COUNT(*) as count FROM users 
         WHERE otp_code IS NOT NULL AND otp_expires_at < NOW()`
      );
      stats.expiredOTP = parseInt(otpResult.rows[0].count);

      // Count expired password reset tokens
      const passwordResetResult = await db.query(
        `SELECT COUNT(*) as count FROM password_reset_tokens 
         WHERE expires_at < NOW()`
      );
      stats.expiredPasswordReset = parseInt(passwordResetResult.rows[0].count);

      // Count expired blacklisted tokens
      const blacklistResult = await db.query(
        `SELECT COUNT(*) as count FROM refresh_token_blacklist 
         WHERE expires_at < NOW()`
      );
      stats.expiredBlacklist = parseInt(blacklistResult.rows[0].count);

      // Total size of auth tables
      const sizeResult = await db.query(
        `SELECT 
           (SELECT COUNT(*) FROM users) as total_users,
           (SELECT COUNT(*) FROM password_reset_tokens WHERE used_at IS NULL) as active_reset_tokens,
           (SELECT COUNT(*) FROM refresh_token_blacklist) as total_blacklisted,
           (SELECT COUNT(*) FROM auth_methods) as total_auth_methods
         `
      );
      const sizeData = sizeResult.rows[0];
      stats.totals = {
        users: parseInt(sizeData.total_users),
        activeResetTokens: parseInt(sizeData.active_reset_tokens),
        blacklistedTokens: parseInt(sizeData.total_blacklisted),
        authMethods: parseInt(sizeData.total_auth_methods),
      };

      return { success: true, stats };
    } catch (error) {
      logger.error('❌ Failed to get cleanup stats', { error: error.message });
      return { success: false, error: error.message };
    }
  }
}

module.exports = CleanupService;
