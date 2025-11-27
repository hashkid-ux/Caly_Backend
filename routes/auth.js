// Backend/routes/auth.js - Authentication endpoints
const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../utils/logger');
const JWTUtils = require('../auth/jwtUtils');
const PasswordUtils = require('../auth/passwordUtils');
const { authMiddleware } = require('../auth/authMiddleware');
const { v4: uuidv4 } = require('uuid');
const emailService = require('../utils/email');

// 🔒 TIMEOUT PROTECTION: Wrap route handler with timeout
const withLoginTimeout = (handler) => {
  return async (req, res) => {
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        logger.error('Login endpoint timeout', { 
          email: req.body?.email,
          requestId: req.requestId 
        });
        res.status(504).json({ error: 'Login took too long. Please try again.' });
      }
    }, 8000); // 8-second timeout for login

    try {
      await handler(req, res);
    } finally {
      clearTimeout(timeoutId);
    }
  };
};

/**
 * POST /api/auth/register - Register a new company with admin user
 * Body: { email, password, companyName, firstName, lastName, phone }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, companyName, firstName, lastName, phone } = req.body;

    // Validation
    if (!email || !password || !companyName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const passwordValidation = PasswordUtils.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password too weak',
        details: passwordValidation.errors 
      });
    }

    // Check if email already exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // ✅ PHASE 2 FIX 2.4: Create client (company) INACTIVE until email verified
    const clientId = uuidv4();
    const clientResult = await db.query(
      `INSERT INTO clients (id, name, email, active, created_at) 
       VALUES ($1, $2, $3, false, NOW()) 
       RETURNING id, name, email`,
      [clientId, companyName, email]
    );

    const client = clientResult.rows[0];

    // Hash password
    const passwordHash = await PasswordUtils.hashPassword(password);

    // Create admin user for this company
    const userId = uuidv4();
    const otp = PasswordUtils.generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // ✅ PHASE 2 FIX 2.4: Set is_active to FALSE until email verified
    const userResult = await db.query(
      `INSERT INTO users 
       (id, client_id, email, password_hash, name, role, otp_code, otp_expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, 'admin', $6, $7, false)
       RETURNING id, email, name, client_id`,
      [userId, clientId, email, passwordHash, (firstName + ' ' + lastName).trim() || 'Admin User', otp, otpExpiresAt]
    );

    const user = userResult.rows[0];

    // Send verification email with OTP
    try {
      const emailResult = await emailService.sendOTPEmail(email, otp);
      if (!emailResult.success) {
        logger.warn('Failed to send verification email', {
          email,
          error: emailResult.error,
        });
      }
    } catch (emailError) {
      logger.error('Error sending verification email', {
        email,
        error: emailError.message,
      });
      // Continue anyway - user can request resend
    }

    // Log audit event
    await db.query(
      `INSERT INTO audit_logs (client_id, event_type, payload, user_id, ip_address)
       VALUES ($1, 'user_registered', $2, $3, $4)`,
      [clientId, JSON.stringify({ email, companyName }), userId, req.ip]
    );

    logger.info('Company registered (awaiting email verification)', { 
      clientId,
      userId,
      email,
      companyName,
      is_active: false
    });

    res.status(201).json({
      message: 'Registration successful. Check your email for verification code.',
      userId: user.id,
      clientId: user.client_id,
      email: user.email
    });

  } catch (error) {
    logger.error('Error registering user', { error: error.message });
    res.status(500).json({ error: 'Failed to register' });
  }
});

/**
 * POST /api/auth/verify-email - Verify email with OTP
 * Body: { email, otp }
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP required' });
    }

    // Find user
    const userResult = await db.query(
      'SELECT id, client_id, otp_code, otp_expires_at FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check OTP
    if (user.otp_code !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (new Date() > user.otp_expires_at) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    // Mark as verified
    await db.query(
      `UPDATE users 
       SET is_active = true, otp_code = NULL, otp_expires_at = NULL
       WHERE id = $1`,
      [user.id]
    );

    // Activate client (company)
    await db.query(
      'UPDATE clients SET active = true WHERE id = $1',
      [user.client_id]
    );

    logger.info('Email verified', { userId: user.id, email });

    res.json({
      message: 'Email verified successfully. You can now log in.',
      verified: true
    });

  } catch (error) {
    logger.error('Error verifying email', { error: error.message });
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

/**
 * POST /api/auth/login - Login with email and password
 * Body: { email, password }
 */
router.post('/login', withLoginTimeout(async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user with client info
    const userResult = await db.query(
      `SELECT u.id, u.email, u.password_hash, u.name, 
              u.client_id, u.role, u.is_active,
              c.name as company_name, c.active as company_active
       FROM users u
       JOIN clients c ON u.client_id = c.id
       WHERE u.email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      // ✅ PHASE 4 FIX 4.5: Track failed login (user not found)
      logger.warn('❌ Login attempt - user not found', { email, ip: req.ip });
      await db.query(
        `INSERT INTO audit_logs (client_id, event_type, payload, ip_address)
         VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'failed_login_user_not_found', $1, $2)`,
        [JSON.stringify({ email }), req.ip]
      ).catch(err => logger.debug('Failed to log', { error: err.message }));
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // ✅ PHASE 2 FIX 2.4: Check if user is active
    if (!user.is_active) {
      logger.warn('Login attempt - user inactive', { email, ip: req.ip });
      return res.status(401).json({ error: 'Account is inactive. Please verify your email.' });
    }

    // ✅ PHASE 2 FIX 2.4: Check if company is active
    if (!user.company_active) {
      logger.warn('Login attempt - company inactive', { email, clientId: user.client_id, ip: req.ip });
      return res.status(401).json({ error: 'Company account is not active. Please contact support.' });
    }

    // Verify password
    const isPasswordValid = await PasswordUtils.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      // ✅ PHASE 4 FIX 4.5: Track failed login (wrong password)
      logger.warn('❌ Login attempt - invalid password', { email, ip: req.ip });
      await db.query(
        `INSERT INTO audit_logs (client_id, event_type, payload, user_id, ip_address)
         VALUES ($1, 'failed_login_invalid_password', $2, $3, $4)`,
        [user.client_id, JSON.stringify({ email }), user.id, req.ip]
      ).catch(err => logger.debug('Failed to log', { error: err.message }));
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      client_id: user.client_id,
      role: user.role,
      companyName: user.company_name
    };

    const { accessToken, refreshToken } = JWTUtils.generateTokenPair(tokenPayload);

    // Update last login
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // ✅ PHASE 4 FIX 4.5: Log successful login
    logger.info('✅ User logged in successfully', { 
      userId: user.id, 
      email, 
      clientId: user.client_id,
      ip: req.ip 
    });

    await db.query(
      `INSERT INTO audit_logs (client_id, event_type, payload, user_id, ip_address)
       VALUES ($1, 'login_success', $2, $3, $4)`,
      [user.client_id, JSON.stringify({ email }), user.id, req.ip]
    ).catch(err => logger.debug('Failed to log', { error: err.message }));

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        clientId: user.client_id,
        companyName: user.company_name,
        role: user.role
      }
    });

  } catch (error) {
    logger.error('Error during login', { error: error.message });
    res.status(500).json({ error: 'Failed to log in' });
  }
}));

/**
 * POST /api/auth/refresh - Refresh access token
 * Body: { refreshToken }
 * Returns new access token if refresh token is valid and not blacklisted
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // ✅ PHASE 2 FIX 2.1: Check if token is blacklisted (on logout)
    const decoded = await JWTUtils.verifyRefreshToken(refreshToken);

    // ✅ PHASE 4 FIX 4.3: Rotate refresh token (issue new, blacklist old)
    const tokenPayload = {
      userId: decoded.userId,
      email: decoded.email,
      client_id: decoded.client_id,
      role: decoded.role,
      companyName: decoded.companyName
    };

    // Rotate token: blacklist old, issue new
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = 
      await JWTUtils.rotateRefreshToken(decoded, tokenPayload);

    logger.info('✅ Token refreshed successfully (rotated)', {
      userId: decoded.userId,
      email: decoded.email,
      tokenRotated: true
    });

    res.json({
      token: newAccessToken,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: '24h'
    });

  } catch (error) {
    logger.warn('🚫 Refresh token failed', { error: error.message });
    
    if (error.message === 'Token has been revoked') {
      return res.status(401).json({ 
        error: 'Session has been invalidated. Please login again.' 
      });
    }

    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

/**
 * POST /api/auth/logout - Logout and blacklist refresh token
 * Requires auth
 * Body: { refreshToken }
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Blacklist the refresh token if provided (prevents reuse)
    if (refreshToken) {
      await JWTUtils.blacklistRefreshToken(refreshToken);
    }

    logger.info('✅ User logged out successfully', { 
      userId: req.user.id,
      email: req.user.email
    });

    res.json({ message: 'Logged out successfully' });

  } catch (error) {
    logger.error('Error during logout', { error: error.message });
    res.status(500).json({ error: 'Failed to log out' });
  }
});

/**
 * GET /api/auth/me - Get current authenticated user
 * Requires auth
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userResult = await db.query(
      `SELECT u.id, u.email, u.name, u.client_id, u.role,
              c.name as company_name, c.active as company_active
       FROM users u
       JOIN clients c ON u.client_id = c.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        clientId: user.client_id,
        companyName: user.company_name,
        companyActive: user.company_active,
        role: user.role
      }
    });

  } catch (error) {
    logger.error('Error fetching user profile', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * POST /api/auth/request-otp - Request a new OTP for email verification
 * Body: { email }
 */
router.post('/request-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const userResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    const otp = PasswordUtils.generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Update OTP in database
    await db.query(
      'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3',
      [otp, otpExpiresAt, userId]
    );

    // Send email
    try {
      const emailResult = await emailService.sendOTPEmail(email, otp);
      if (!emailResult.success) {
        logger.warn('Failed to send OTP email', {
          email,
          error: emailResult.error,
        });
      }
    } catch (emailError) {
      logger.error('Error sending OTP email', { error: emailError.message });
    }

    logger.info('OTP requested', { email });

    res.json({
      message: 'OTP sent to your email. Check your inbox.'
    });

  } catch (error) {
    logger.error('Error requesting OTP', { error: error.message });
    res.status(500).json({ error: 'Failed to request OTP' });
  }
});

/**
 * POST /api/auth/refresh - Refresh JWT token
 * Body: { refreshToken }
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = JWTUtils.verifyToken(refreshToken);

    // Issue new access token
    const newToken = JWTUtils.generateToken({
      userId: decoded.userId,
      email: decoded.email,
      client_id: decoded.client_id,
      role: decoded.role,
      companyName: decoded.companyName
    });

    res.json({
      token: newToken,
      expiresIn: '24h'
    });

  } catch (error) {
    logger.error('Error refreshing token', { error: error.message });
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

/**
 * ✅ PHASE 2 FIX 2.2: Password reset endpoints
 */

/**
 * POST /api/auth/forgot-password - Request password reset
 * Body: { email }
 * Returns: { message: 'Reset link sent to email' }
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // Find user - but don't reveal if email exists (security)
    const userResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      // Return success even if email not found (security best practice)
      return res.json({ 
        message: 'If that email exists, a reset link has been sent.' 
      });
    }

    const user = userResult.rows[0];

    // Generate secure reset token
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    // Save reset token to database
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, reset_token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [user.id, resetToken, expiresAt]
    );

    // Send reset email
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    
    try {
      await emailService.sendPasswordResetEmail(email, resetLink);
      logger.info('✅ Password reset email sent', { email });
    } catch (emailError) {
      logger.warn('⚠️  Failed to send password reset email', { 
        email,
        error: emailError.message 
      });
      // Still return success - don't reveal email sending issues
    }

    res.json({ 
      message: 'If that email exists, a reset link has been sent.' 
    });

  } catch (error) {
    logger.error('Error in forgot-password', { error: error.message });
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * POST /api/auth/reset-password - Reset password with token
 * Body: { email, reset_token, new_password }
 * Returns: { message: 'Password reset successful' }
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, reset_token, new_password } = req.body;

    // Validation
    if (!email || !reset_token || !new_password) {
      return res.status(400).json({ error: 'Email, token, and password required' });
    }

    // Validate new password strength
    const passwordValidation = PasswordUtils.validatePasswordStrength(new_password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password too weak',
        details: passwordValidation.errors 
      });
    }

    // Find user
    const userResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Verify reset token exists, is valid, and not used
    const tokenResult = await db.query(
      `SELECT id FROM password_reset_tokens 
       WHERE user_id = $1 AND reset_token = $2 AND expires_at > NOW() AND used_at IS NULL
       LIMIT 1`,
      [user.id, reset_token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired reset token' });
    }

    const tokenRecord = tokenResult.rows[0];

    // Hash new password
    const hashedPassword = await PasswordUtils.hashPassword(new_password);

    // Update password in transaction
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Update user password
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [hashedPassword, user.id]
      );

      // Mark token as used
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [tokenRecord.id]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Send confirmation email
    try {
      await emailService.sendPasswordResetConfirmationEmail(email);
      logger.info('✅ Password reset confirmation email sent', { email });
    } catch (emailError) {
      logger.warn('⚠️  Failed to send confirmation email', { 
        email,
        error: emailError.message 
      });
    }

    logger.info('✅ Password reset successful', { userId: user.id, email });

    res.json({ 
      message: 'Password reset successful. Please login with your new password.' 
    });

  } catch (error) {
    logger.error('Error in reset-password', { error: error.message });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

/**
 * ✅ PHASE 3 FIX 3.1: Company Onboarding - Update auto-generated company name
 * PUT /api/auth/company
 * 
 * Purpose:
 * - Allow users (especially OAuth) to customize their company name after registration
 * - Company created with auto-generated name (e.g., "John's Company") can be renamed
 * - Only company admin can update company details
 * 
 * Body: { companyName, companyWebsite (optional), companyPhone (optional) }
 * Returns: Updated company details
 */
router.put('/company', authMiddleware, async (req, res) => {
  try {
    const { companyName, companyWebsite, companyPhone } = req.body;
    const userId = req.user.userId;

    // Validation
    if (!companyName || !companyName.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    if (companyName.trim().length < 2) {
      return res.status(400).json({ error: 'Company name must be at least 2 characters' });
    }

    if (companyName.trim().length > 100) {
      return res.status(400).json({ error: 'Company name must be less than 100 characters' });
    }

    // Get user's client_id to verify they own the company
    const userResult = await db.query(
      'SELECT client_id, role FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows.length) {
      logger.warn('Company update - user not found', { userId });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { client_id, role } = userResult.rows[0];

    // Only admins can update company details
    if (role !== 'admin') {
      logger.warn('Company update - non-admin attempted update', { userId, role });
      return res.status(403).json({ error: 'Only company admins can update company details' });
    }

    // Update company with new name and optional fields
    const updateFields = ['name = $1', 'updated_at = NOW()'];
    const values = [companyName.trim()];

    if (companyWebsite) {
      updateFields.push('website = $' + (values.length + 1));
      values.push(companyWebsite.trim());
    }

    if (companyPhone) {
      updateFields.push('phone = $' + (values.length + 1));
      values.push(companyPhone.trim());
    }

    values.push(client_id);

    const updateQuery = `
      UPDATE clients 
      SET ${updateFields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, name, email, website, phone, active, created_at, updated_at
    `;

    const result = await db.query(updateQuery, values);

    if (!result.rows.length) {
      logger.error('Company update - company not found', { client_id });
      return res.status(404).json({ error: 'Company not found' });
    }

    const updatedCompany = result.rows[0];

    // Log audit event
    await db.query(
      `INSERT INTO audit_logs (client_id, event_type, payload, user_id, ip_address)
       VALUES ($1, 'company_updated', $2, $3, $4)`,
      [client_id, JSON.stringify({ 
        updatedFields: updateFields, 
        newName: companyName.trim() 
      }), userId, req.ip]
    );

    logger.info('✅ Company onboarding completed', {
      userId,
      client_id,
      newCompanyName: companyName.trim(),
    });

    res.json({
      success: true,
      message: 'Company profile updated successfully',
      company: updatedCompany,
    });

  } catch (error) {
    logger.error('Error in company update', { error: error.message });
    res.status(500).json({ error: 'Failed to update company profile' });
  }
});

/**
 * ✅ PHASE 3 FIX 3.1: Get Company Details
 * GET /api/auth/company
 * 
 * Purpose: Fetch current company details for frontend to show in onboarding
 * Returns: Company name, status, and other details
 */
router.get('/company', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user's client_id
    const userResult = await db.query(
      'SELECT client_id FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows.length) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { client_id } = userResult.rows[0];

    // Fetch company details
    const companyResult = await db.query(
      'SELECT id, name, email, website, phone, active, created_at, updated_at FROM clients WHERE id = $1',
      [client_id]
    );

    if (!companyResult.rows.length) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({
      success: true,
      company: companyResult.rows[0],
    });

  } catch (error) {
    logger.error('Error fetching company details', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch company details' });
  }
});

/**
 * ✅ PHASE 3 FIX 3.3: Get Linked Auth Methods
 * GET /api/auth/linked-accounts
 * 
 * Purpose: Show user all their linked authentication methods
 * Returns: List of auth methods (email, OAuth providers, etc.)
 */
router.get('/linked-accounts', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT id, provider, provider_email, is_primary, linked_at, last_used_at
       FROM auth_methods
       WHERE user_id = $1
       ORDER BY is_primary DESC, linked_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      linkedAccounts: result.rows,
    });

  } catch (error) {
    logger.error('Error fetching linked accounts', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch linked accounts' });
  }
});

/**
 * ✅ PHASE 3 FIX 3.3: Unlink Auth Method
 * DELETE /api/auth/linked-accounts/:provider
 * 
 * Purpose: Remove a linked authentication method
 * Validation: Cannot remove last auth method or primary method if alternatives exist
 * Body: { password } - For security, require password to unlink methods
 */
router.delete('/linked-accounts/:provider', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { provider } = req.params;
    const { password } = req.body;

    // Validate provider
    if (!provider || !['email', 'google', 'github'].includes(provider.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    // Get user's current password hash
    const userResult = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows.length) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify password for security
    const isPasswordValid = await PasswordUtils.comparePassword(
      password,
      userResult.rows[0].password_hash
    );

    if (!isPasswordValid && provider !== 'email') {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Check how many auth methods user has
    const authMethodsResult = await db.query(
      'SELECT COUNT(*) as count FROM auth_methods WHERE user_id = $1 AND provider != $2',
      [userId, provider]
    );

    const remainingMethods = parseInt(authMethodsResult.rows[0].count);

    // Cannot delete if it's the only method
    if (remainingMethods === 0) {
      return res.status(400).json({
        error: 'Cannot remove your only authentication method. Link another method first.'
      });
    }

    // Delete the auth method
    const deleteResult = await db.query(
      'DELETE FROM auth_methods WHERE user_id = $1 AND provider = $2 RETURNING id',
      [userId, provider.toLowerCase()]
    );

    if (!deleteResult.rows.length) {
      return res.status(404).json({ error: 'Auth method not found' });
    }

    // Log audit event
    await db.query(
      `INSERT INTO audit_logs (client_id, event_type, payload, user_id, ip_address)
       VALUES ($1, 'auth_method_unlinked', $2, $3, $4)`,
      [req.user.client_id, JSON.stringify({ provider }), userId, req.ip]
    );

    logger.info('✅ Auth method unlinked', { userId, provider });

    res.json({
      success: true,
      message: `${provider} account unlinked successfully`,
    });

  } catch (error) {
    logger.error('Error unlinking auth method', { error: error.message });
    res.status(500).json({ error: 'Failed to unlink authentication method' });
  }
});

/**
 * ✅ PHASE 3 FIX 3.3: Check if Email is Linked
 * POST /api/auth/check-email-link
 * 
 * Purpose: Check if an email is already linked to another account
 * Security: Prevents email enumeration - always returns generic response
 * Body: { email }
 * Returns: { available: boolean }
 */
router.post('/check-email-link', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const result = await db.query(
      `SELECT COUNT(*) as count FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    const isLinked = parseInt(result.rows[0].count) > 0;

    // Always return generic response to prevent email enumeration
    res.json({
      success: true,
      available: !isLinked,
    });

  } catch (error) {
    logger.error('Error checking email link', { error: error.message });
    // Return generic response on error
    res.json({ success: true, available: false });
  }
});

/**
 * ✅ PHASE 4 FIX 4.4: Resend Verification Email
 * POST /api/auth/resend-verification-email
 * 
 * Purpose:
 * - Allow users to request a new OTP if they didn't receive one
 * - Rate limited to prevent spam
 * - Returns generic success message (doesn't reveal if email exists)
 * 
 * Body: { email }
 * Returns: { success: true, message: '...' }
 */
router.post('/resend-verification-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Valid email address required' });
    }

    // Generic response to prevent email enumeration
    const genericResponse = {
      success: true,
      message: 'If that email exists and needs verification, a new OTP has been sent.'
    };

    // Find user by email
    const userResult = await db.query(
      'SELECT id, email, is_active FROM users WHERE LOWER(email) = LOWER($1)',
      [email.toLowerCase()]
    );

    if (!userResult.rows.length) {
      // User doesn't exist - return generic response
      return res.json(genericResponse);
    }

    const user = userResult.rows[0];

    // If user already verified, no need to send OTP
    if (user.is_active) {
      // Still return generic response to not leak info
      return res.json(genericResponse);
    }

    // Generate new OTP
    const otp = PasswordUtils.generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update OTP in database (within transaction to be atomic)
    const updateResult = await db.query(
      `UPDATE users 
       SET otp_code = $1, otp_expires_at = $2 
       WHERE id = $3 
       RETURNING id, email`,
      [otp, otpExpiresAt, user.id]
    );

    if (!updateResult.rows.length) {
      logger.error('Failed to update OTP for user', { userId: user.id });
      return res.json(genericResponse); // Still return generic response
    }

    // Send OTP email
    try {
      const emailResult = await emailService.sendOTPEmail(email, otp);
      if (!emailResult.success) {
        logger.warn('Failed to send verification email', {
          email,
          error: emailResult.error,
        });
        // Don't fail - user can try again
      } else {
        logger.info('✅ Verification email resent', { email, userId: user.id });
      }
    } catch (emailError) {
      logger.error('Error sending verification email', {
        email,
        error: emailError.message
      });
      // Don't fail - return generic response
    }

    // Log audit event
    await db.query(
      `INSERT INTO audit_logs (client_id, event_type, payload, user_id, ip_address)
       VALUES ($1, 'verification_email_resent', $2, $3, $4)`,
      [user.id, JSON.stringify({ email }), user.id, req.ip]
    );

    res.json(genericResponse);

  } catch (error) {
    logger.error('Error in resend-verification-email', { error: error.message });
    // Return generic response even on error
    res.json({
      success: true,
      message: 'If that email exists and needs verification, a new OTP has been sent.'
    });
  }
});

module.exports = router;

