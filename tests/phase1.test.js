/**
 * Phase 1 Implementation Test Suite
 * Tests for: Error Handler, Rate Limiter, Validation, Audit Logger, Health Checks
 */

const request = require('supertest');
const express = require('express');
const {
  errorHandler,
  requestContextMiddleware,
  asyncHandler,
  ValidationError,
  RateLimitError,
  NotFoundError,
} = require('../middleware/errorHandler');
const { loginRateLimiter, apiRateLimiter, store } = require('../middleware/rateLimiter');
const { validateBody, commonSchemas } = require('../middleware/validation');
const { AuditEventType, logAuditEvent } = require('../services/auditLogger');

/**
 * Test Suite: Error Handler
 */
describe('Error Handler Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(requestContextMiddleware);

    // Test endpoint that throws error
    app.get('/test-error', (req, res, next) => {
      next(new ValidationError('Test validation error', { email: ['Invalid email'] }));
    });

    // Test endpoint that throws async error
    app.get('/test-async-error', asyncHandler(async (req, res) => {
      throw new NotFoundError('User');
    }));

    app.use(errorHandler);
  });

  test('should return standardized error response for validation errors', async () => {
    const response = await request(app).get('/test-error');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual({ email: ['Invalid email'] });
    expect(response.body.error.requestId).toBeDefined();
  });

  test('should return 404 for not found errors', async () => {
    const response = await request(app).get('/test-async-error');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).toContain('User');
  });

  test('should include request ID in error response', async () => {
    const response = await request(app).get('/test-error');

    expect(response.body.error.requestId).toMatch(/^\d+-[a-z0-9]+$/);
  });

  test('should set retry-after header for rate limit errors', async () => {
    app.get('/test-rate-limit', (req, res, next) => {
      next(new RateLimitError(60));
    });

    const response = await request(app).get('/test-rate-limit');

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
  });
});

/**
 * Test Suite: Rate Limiter
 */
describe('Rate Limiter Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    store.clear();
  });

  afterEach(() => {
    store.clear();
  });

  test('login rate limiter should allow 6 attempts per 15 minutes', async () => {
    app.post('/api/auth/login', loginRateLimiter, (req, res) => {
      res.json({ success: true });
    });

    // First 6 requests should succeed
    for (let i = 0; i < 6; i++) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password' });

      expect(response.status).toBe(200);
    }

    // 7th request should fail
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password' });

    expect(response.status).toBe(429);
  });

  test('rate limit headers should be included in response', async () => {
    app.get('/api/test', apiRateLimiter, (req, res) => {
      res.json({ success: true });
    });

    const response = await request(app).get('/api/test');

    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    expect(response.headers['x-ratelimit-reset']).toBeDefined();
  });

  test('different IPs should have separate rate limit buckets', async () => {
    app.post('/api/auth/login', loginRateLimiter, (req, res) => {
      res.json({ success: true });
    });

    // Make requests from different IPs (simulated via headers)
    for (let i = 0; i < 6; i++) {
      const response = await request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', '192.168.1.1')
        .send({ email: 'test@example.com', password: 'password' });

      expect(response.status).toBe(200);
    }

    // Different IP should still have 6 attempts available
    const response = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '192.168.1.2')
      .send({ email: 'test@example.com', password: 'password' });

    expect(response.status).toBe(200);
  });
});

/**
 * Test Suite: Input Validation
 */
describe('Input Validation Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Register endpoint with validation
    app.post(
      '/api/register',
      validateBody(commonSchemas.registerSchema),
      (req, res) => {
        res.json({ success: true, user: req.body });
      }
    );

    app.use(errorHandler);
  });

  test('should reject registration with missing required fields', async () => {
    const response = await request(app).post('/api/register').send({
      email: 'test@example.com',
      password: 'password123',
      // missing name
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.name).toBeDefined();
  });

  test('should reject registration with invalid email', async () => {
    const response = await request(app).post('/api/register').send({
      name: 'Test User',
      email: 'invalid-email',
      password: 'password123',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details.email).toBeDefined();
  });

  test('should reject registration with short password', async () => {
    const response = await request(app).post('/api/register').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details.password).toBeDefined();
  });

  test('should accept valid registration request', async () => {
    const response = await request(app).post('/api/register').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      phone: '+919876543210',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.email).toBe('test@example.com');
  });
});

/**
 * Test Suite: Request Context
 */
describe('Request Context Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(requestContextMiddleware);

    app.get('/test', (req, res) => {
      res.json({ requestId: req.requestId });
    });
  });

  test('should assign unique requestId to each request', async () => {
    const response1 = await request(app).get('/test');
    const response2 = await request(app).get('/test');

    expect(response1.body.requestId).toBeDefined();
    expect(response2.body.requestId).toBeDefined();
    expect(response1.body.requestId).not.toBe(response2.body.requestId);
  });

  test('requestId should follow format timestamp-randomString', async () => {
    const response = await request(app).get('/test');

    expect(response.body.requestId).toMatch(/^\d+-[a-z0-9]+$/);
  });
});

/**
 * Test Suite: Health Checks
 */
describe('Health Check Endpoints', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(require('../routes/health'));
  });

  test('GET /live should return 200 immediately', async () => {
    const response = await request(app).get('/live');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('alive');
    expect(response.body.timestamp).toBeDefined();
  });

  test('GET /ready should check database and environment', async () => {
    const response = await request(app).get('/ready');

    expect(response.body.status).toBeDefined();
    expect(response.body.checks).toBeDefined();
    expect(response.body.checks.database).toBeDefined();
    expect(response.body.checks.environment).toBeDefined();
  });

  test('GET /detailed should return comprehensive metrics', async () => {
    const response = await request(app).get('/detailed');

    expect(response.body.status).toBeDefined();
    expect(response.body.checks.database).toBeDefined();
    expect(response.body.checks.encryption).toBeDefined();
    expect(response.body.checks.environment).toBeDefined();
    expect(response.body.checks.memory).toBeDefined();
    expect(response.body.checks.uptime).toBeDefined();
  });

  test('GET /metrics should return performance statistics', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.body.uptime).toBeDefined();
    expect(response.body.memory).toBeDefined();
    expect(response.body.database).toBeDefined();
    expect(response.body.environment).toBeDefined();
  });
});

module.exports = {
  describe,
  test,
  beforeEach,
  afterEach,
};
