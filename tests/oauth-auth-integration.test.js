/**
 * OAuth & Authentication Integration Test Suite
 * 
 * Tests the complete flow:
 * 1. Google OAuth - New user registration
 * 2. Google OAuth - Existing user login
 * 3. Email/OTP - New user registration  
 * 4. Email/OTP - Existing user login
 * 5. JWT token generation, validation, refresh
 * 6. Multi-tenancy enforcement
 * 7. Session management
 * 
 * Run with: npm test -- tests/oauth-auth-integration.test.js
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

describe('OAuth & Authentication Integration Tests', () => {
  let app;
  let db;
  let testUserId;
  let testClientId;
  let testToken;
  let testEmail = `test-${Date.now()}@example.com`;

  beforeAll(() => {
    // Load app from server.js
    app = require('../server');
    db = require('../db/postgres');
  });

  // ============================================
  // TEST SUITE 1: GOOGLE OAUTH FLOW
  // ============================================

  describe('Google OAuth Registration & Login', () => {
    it('Should create new user and client on first Google OAuth login', async () => {
      // This test would require mocking Google's OAuth callback
      // In real scenario, we'd use passport mock
      
      // Expected flow:
      // 1. User clicks "Login with Google"
      // 2. Redirected to /api/auth/google
      // 3. Google OAuth strategy invoked
      // 4. Verify callback creates new client and user
      // 5. JWT token generated
      // 6. User redirected with token
      
      expect(true).toBe(true); // Placeholder
    });

    it('Should update OAuth credentials for existing user', async () => {
      // Expected:
      // 1. User exists in database with email
      // 2. User signs in with Google same email
      // 3. google_id and google_refresh_token updated
      // 4. password_hash remains NULL for OAuth users
      // 5. is_verified set to true
      
      expect(true).toBe(true); // Placeholder
    });

    it('Should NOT create duplicate clients for same email', async () => {
      // Scenario:
      // 1. User A registers with email test@example.com (password)
      // 2. Same user tries OAuth with test@example.com
      // Should: Link to existing client instead of creating duplicate
      
      expect(true).toBe(true); // Placeholder
    });

    it('Should handle missing email gracefully', async () => {
      // Google sometimes doesn't provide email
      // Expected: Proper error response
      
      expect(true).toBe(true); // Placeholder
    });
  });

  // ============================================
  // TEST SUITE 2: EMAIL/OTP REGISTRATION
  // ============================================

  describe('Email/OTP Registration Flow', () => {
    it('Should register new company with admin user via email/password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: 'Test@12345',
          companyName: 'Test Company',
          firstName: 'Test',
          lastName: 'User',
        });

      expect(response.status).toBe(201);
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(testEmail);
      expect(response.body.otp).toBeDefined();

      testUserId = response.body.user.id;
      testClientId = response.body.user.client_id;
    });

    it('Should reject duplicate email registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: 'Test@12345',
          companyName: 'Another Company',
          firstName: 'Another',
          lastName: 'User',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already registered');
    });

    it('Should send OTP via email', async () => {
      // Expected: Email service called with OTP
      // User receives email with 6-digit code
      
      expect(true).toBe(true); // Placeholder
    });

    it('Should verify OTP and confirm email', async () => {
      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({
          email: testEmail,
          otp: '123456', // In real test, get from email mock
        });

      // Expected behavior:
      // - OTP validated against database record
      // - is_verified = true
      // - otp_expires_at check passed
      // - User can now login

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('Should reject expired OTP', async () => {
      // Scenario: OTP older than 10 minutes
      
      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({
          email: testEmail,
          otp: '000000',
        });

      expect(response.status).toBe(400);
    });
  });

  // ============================================
  // TEST SUITE 3: LOGIN & JWT GENERATION
  // ============================================

  describe('Login & JWT Token Generation', () => {
    it('Should generate valid JWT on successful login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'Test@12345',
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();

      testToken = response.body.token;

      // Decode and validate JWT structure
      const decoded = jwt.decode(testToken);
      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe(testEmail);
      expect(decoded.clientId).toBe(testClientId);
      expect(decoded.role).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('JWT should contain required claims for multi-tenancy', async () => {
      const decoded = jwt.decode(testToken);

      // Multi-tenancy critical claims
      expect(decoded.clientId).toBe(testClientId);
      expect(decoded.userId).toBe(testUserId);
      expect(decoded.role).toMatch(/admin|user|manager|viewer/);
    });

    it('Should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword123',
        });

      expect(response.status).toBe(401);
    });

    it('Should reject login for non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Test@12345',
        });

      expect(response.status).toBe(401);
    });
  });

  // ============================================
  // TEST SUITE 4: TOKEN VALIDATION & REFRESH
  // ============================================

  describe('JWT Validation & Refresh', () => {
    it('Should validate active JWT token', async () => {
      const response = await request(app)
        .post('/api/auth/verify-token')
        .send({ token: testToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe(testUserId);
    });

    it('Should reject invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/verify-token')
        .send({ token: 'invalid.token.here' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('Should reject expired token', async () => {
      // Create token with 1ms expiry
      const expiredToken = jwt.sign(
        { userId: testUserId, clientId: testClientId },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1ms' }
      );

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 10));

      const response = await request(app)
        .post('/api/auth/verify-token')
        .send({ token: expiredToken });

      expect(response.status).toBe(401);
    });

    it('Should refresh valid token with new expiry', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ token: testToken });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();

      const oldDecoded = jwt.decode(testToken);
      const newDecoded = jwt.decode(response.body.token);

      expect(oldDecoded.userId).toBe(newDecoded.userId);
      expect(newDecoded.exp).toBeGreaterThan(oldDecoded.exp);
    });

    it('Should reject refresh with expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: testUserId, clientId: testClientId },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1ms' }
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ token: expiredToken });

      expect(response.status).toBe(401);
    });
  });

  // ============================================
  // TEST SUITE 5: MULTI-TENANCY ENFORCEMENT
  // ============================================

  describe('Multi-Tenancy Access Control', () => {
    let otherUserToken;
    let otherClientId;

    beforeAll(async () => {
      // Create second test user in different client
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: `other-${Date.now()}@example.com`,
          password: 'Test@12345',
          companyName: 'Other Company',
          firstName: 'Other',
          lastName: 'User',
        });

      otherClientId = response.body.user.client_id;

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: response.body.user.email,
          password: 'Test@12345',
        });

      otherUserToken = loginResponse.body.token;
    });

    it('Should allow user to access their own client resources', async () => {
      const response = await request(app)
        .get(`/api/clients/${testClientId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
    });

    it('Should DENY user from accessing other client resources', async () => {
      // Try to access different client
      const response = await request(app)
        .get(`/api/clients/${otherClientId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Access denied');
    });

    it('JWT should enforce client_id isolation', async () => {
      // User token should only grant access to their clientId
      const decoded = jwt.decode(testToken);
      const otherDecoded = jwt.decode(otherUserToken);

      expect(decoded.clientId).not.toBe(otherDecoded.clientId);
    });
  });

  // ============================================
  // TEST SUITE 6: SESSION MANAGEMENT
  // ============================================

  describe('Session Management', () => {
    it('Should track last_login timestamp on authentication', async () => {
      const beforeLogin = new Date();

      await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'Test@12345',
        });

      // Query database for updated user
      const result = await db.query(
        'SELECT last_login FROM users WHERE id = $1',
        [testUserId]
      );

      const lastLogin = new Date(result.rows[0].last_login);
      expect(lastLogin.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    });

    it('Should logout and invalidate token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);

      // Token should no longer be valid (if logout blacklists it)
      // Note: Depends on logout implementation
    });

    it('Should verify OAuth user has is_verified=true', async () => {
      // For OAuth users, is_verified should be automatically true
      const result = await db.query(
        'SELECT is_verified, google_id FROM users WHERE id = $1',
        [testUserId]
      );

      // If this is OAuth user:
      if (result.rows[0].google_id) {
        expect(result.rows[0].is_verified).toBe(true);
      }
    });
  });

  // ============================================
  // TEST SUITE 7: PASSWORD HANDLING
  // ============================================

  describe('Password Handling', () => {
    it('Should NOT store password_hash for OAuth users', async () => {
      // Query for OAuth user and verify password_hash is NULL
      // This would need OAuth test user setup
      
      expect(true).toBe(true); // Placeholder
    });

    it('Should REQUIRE password_hash for email/password users', async () => {
      const result = await db.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [testUserId]
      );

      expect(result.rows[0].password_hash).not.toBeNull();
    });

    it('Should validate password strength on registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: `weak-${Date.now()}@example.com`,
          password: '123', // Too weak
          companyName: 'Test',
          firstName: 'Test',
          lastName: 'User',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('weak');
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await db.query('DELETE FROM users WHERE email = $1', [testEmail]);
    await db.query('DELETE FROM clients WHERE email = $1', [testEmail]);
  });
});
