// Backend/auth/passwordUtils.js - Password hashing and validation
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

const SALT_ROUNDS = 10;

class PasswordUtils {
  /**
   * Hash a password with bcrypt
   * @param {string} password - Plain text password
   * @returns {Promise<string>} - Hashed password
   */
  static async hashPassword(password) {
    try {
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      return hash;
    } catch (error) {
      logger.error('Error hashing password', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify a password against a hash
   * @param {string} password - Plain text password to check
   * @param {string} hash - Hashed password from database
   * @returns {Promise<boolean>} - True if password matches
   */
  static async verifyPassword(password, hash) {
    try {
      const isMatch = await bcrypt.compare(password, hash);
      return isMatch;
    } catch (error) {
      logger.error('Error verifying password', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {object} - { isValid, errors }
   */
  static validatePasswordStrength(password) {
    const errors = [];

    if (!password || password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain lowercase letters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain uppercase letters');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain numbers');
    }
    if (!/[!@#$%^&*]/.test(password)) {
      errors.push('Password must contain special characters (!@#$%^&*)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate a random OTP for email verification
   * @returns {string} - 6-digit OTP
   */
  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}

module.exports = PasswordUtils;
