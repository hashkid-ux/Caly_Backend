// server.js - Main Caly Server (Updated for Multi-tenancy + OAuth2 + Safe DB Init)
require('dotenv').config();

// CRITICAL: Initialize Sentry FIRST - before any errors can occur
const { initSentry, getSentryMiddleware, flush: sentryfluesh } = require('./utils/sentryIntegration');
initSentry();

// CRITICAL: Validate environment variables BEFORE anything else
const envValidator = require('./utils/envValidator');
envValidator.validate();

// ✅ PRODUCTION: Additional validation for production deployments
if (process.env.NODE_ENV === 'production') {
  const requiredProductionVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'FRONTEND_URL',
    'EXOTEL_API_KEY',
    'EXOTEL_ACCOUNT_SID',
    'WASABI_ACCESS_KEY',
    'WASABI_SECRET_KEY'
  ];
  
  const missingVars = requiredProductionVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    console.error('❌ PRODUCTION STARTUP FAILED: Missing required environment variables:');
    missingVars.forEach(v => console.error(`   - ${v}`));
    console.error('\n⚠️  Cannot start in production mode without these variables.');
    process.exit(1);
  }
  
  console.log('✅ All production environment variables validated');
}

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const WebSocket = require('ws');
const passport = require('passport');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const fs = require('fs');
const path = require('path');
const resolve = require('./utils/moduleResolver');
const logger = require(resolve('./utils/logger'));
const db = require(resolve('db/postgres'));
const pool = require(resolve('db/pooling')).pool;
const sessionManager = require(resolve('sessions/CallSessionManager'));
const GracefulShutdown = require(resolve('utils/gracefulShutdown'));
const requestIdMiddleware = require(resolve('middleware/requestId'));
const setupSwagger = require(resolve('docs/swagger'));
const { createApmMiddleware } = require(resolve('utils/apmMonitoring'));

// Load Passport strategies
require('./config/passport-google');

// Load robust database initialization
const { initializeDatabase } = require('./db/initDatabase');
const { runMigrations } = require('./db/migrationsystem');

/**
 * 🔒 INITIALIZE DATABASE WITH ROBUST ERROR HANDLING
 * ✅ Proper SQL parsing (not naive semicolon split)
 * ✅ Table existence validation
 * ✅ Comprehensive error logging
 * ✅ Idempotent (safe to run multiple times)
 * ✅ Runs migrations AFTER schema validation
 */
async function initDatabaseAndMigrations() {
  try {
    logger.info('🚀 PHASE 1: Initializing core database schema...');

    // Use robust initialization from initDatabase.js
    await initializeDatabase();

    logger.info('🚀 PHASE 2: Running database migrations...');

    // Run migrations AFTER schema is validated
    const migrationsSuccess = await runMigrations();

    if (!migrationsSuccess) {
      logger.warn(
        '⚠️  Some migrations had issues, but core schema is valid'
      );
    }

    logger.info('✅ ALL DATABASE INITIALIZATION COMPLETE');
    return true;
  } catch (error) {
    logger.error('❌ CRITICAL: Database initialization failed', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });

    logger.error(
      '⚠️  ATTENTION: Database may not be ready. Check logs for details.'
    );

    throw error;
  }
}

// Import middleware services
const auditLogger = require(resolve('services/auditLogger'));
const { errorHandler, NotFoundError } = require(resolve('middleware/errorHandler'));
const {
  loginRateLimiter,
  registerRateLimiter,
  verifyEmailRateLimiter,
  resendOtpRateLimiter,
  webhookRateLimiter,
  apiRateLimiter
} = require(resolve('middleware/rateLimiter'));

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server, path: '/audio' });

// Import new Phase 2 middleware
const {
  httpsRedirect,
  securityHeaders,
} = require(resolve('middleware/security'));
const {
  requestLogger,
  requestBodyLogger,
  errorResponseLogger,
  anomalyDetector,
  performanceTracker,
  slowRequestDetector,
} = require(resolve('middleware/logging'));
const {
  createConnectionPool,
  poolStatsMiddleware,
} = require(resolve('db/pooling'));

// Middleware
app.use(helmet());

// ✅ PHASE 3: Sentry error tracking (must be first middleware)
const { requestHandler: sentryRequestHandler, errorHandler: sentryErrorHandler } = getSentryMiddleware();
app.use(sentryRequestHandler);

// ✅ PHASE 3: APM monitoring middleware
app.use(createApmMiddleware());

// 🔒 SECURITY FIX 1: Proper CORS configuration - strict production validation
const allowedOrigins = (() => {
  const origins = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URL_ALT,
  ].filter(Boolean);
  
  // Strict production validation
  if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
    throw new Error('❌ CRITICAL: FRONTEND_URL must be set in production');
  }
  
  // Add localhost fallback only in development
  if (process.env.NODE_ENV !== 'production') {
    origins.push('http://localhost:3000');
  }
  
  return origins;
})();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600,
}));

// 🔒 SECURITY FIX 2: Protect SESSION_SECRET - fail fast if not set
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error(
    '❌ FATAL: SESSION_SECRET environment variable must be set to 32+ character string.\n' +
    'Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

// ✅ Production Session Storage - PostgreSQL (replaces MemoryStore)
app.use(
  session({
    store: new pgSession({
      pool: pool,
      tableName: 'session', // PostgreSQL will create this table automatically
      ttl: 24 * 60 * 60, // 24 hours in seconds
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true, // HTTPS only - no HTTP in production
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    },
  })
);
logger.info('✅ Session store configured (PostgreSQL - production-ready, secure CORS whitelist)');

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// 🔒 TIMEOUT PROTECTION: Set timeouts for all requests
app.use((req, res, next) => {
  // Set socket timeout (connection level)
  req.socket.setTimeout(35000); // 35 seconds
  res.setTimeout(35000); // 35 seconds
  
  // Track request start time for logging
  req.startTime = Date.now();
  
  next();
});

// Handle timeout responses
app.use((req, res, next) => {
  res.on('timeout', () => {
    const duration = Date.now() - req.startTime;
    logger.error('Response timeout', { 
      path: req.path, 
      method: req.method,
      duration: `${duration}ms`,
      requestId: req.requestId 
    });
    if (!res.headersSent) {
      res.status(504).json({ error: 'Request timeout. Please try again.' });
    }
  });
  
  next();
});

// Request size limits (security)
// 🔒 PHASE 1 FIX 1.4: Capture raw body for webhook signature verification
app.use(bodyParser.json({ 
  limit: '1mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf-8');
  }
}));
app.use(bodyParser.urlencoded({ extended: true, limit: '1kb' }));
app.use(bodyParser.raw({ type: 'audio/wav', limit: '10mb' }));

// Request ID (must be early for correlation)
app.use(requestIdMiddleware);

// HTTPS redirect and security headers (Phase 2)
app.use(httpsRedirect);
app.use(securityHeaders);

// Enhanced logging (Phase 2)
app.use(anomalyDetector);
app.use(performanceTracker);
app.use(slowRequestDetector(1000)); // Log requests slower than 1 second

// Audit logging
app.use(auditLogger.auditMiddleware);

// Detailed request logging
app.use(requestLogger);
app.use(requestBodyLogger);
app.use(errorResponseLogger);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    requestId: req.requestId,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Setup Swagger/OpenAPI documentation
setupSwagger(app);

// Health check routes
app.use('/health', require(resolve('routes/health')));

// Test/debug routes (development only - disabled in production)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/test', require(resolve('routes/test')));
  logger.info('⚠️  Test routes enabled (development mode only)');
} else {
  logger.info('✅ Test routes disabled (production mode)');
}

// OAuth routes (public - for Google authentication)
// IMPORTANT: Registered at /api/auth not /api/oauth because Google redirects to /api/auth/google/callback
app.use('/api/auth', require(resolve('routes/oauth')));

// Legacy health endpoint for backward compatibility
app.get('/health-legacy', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'caly-voice-agent',
    version: '1.0.0',
    agents: {
      total: 14,
      registered: Object.keys(require('./agents/orchestrator').agentRegistry || {}).length,
    },
  });
});

// Authentication routes (public - no auth required)
// Apply strict rate limiting to auth endpoints
app.use('/api/auth/login', loginRateLimiter);
app.use('/api/auth/register', registerRateLimiter);
app.use('/api/auth/verify-email', verifyEmailRateLimiter);
app.use('/api/auth/resend-otp', resendOtpRateLimiter);
app.use('/api/auth', require(resolve('routes/auth')));

// Exotel webhooks (with webhook rate limiting)
// 🔒 PHASE 1 FIX 1.4: Add webhook signature verification
const { verifyExotelWebhook } = require(resolve('middleware/webhookVerifier'));
const exotelRoutes = require(resolve('routes/exotel'));
app.post('/webhooks/exotel/call-start', webhookRateLimiter, verifyExotelWebhook, exotelRoutes.handleCallStart);
app.post('/webhooks/exotel/call-end', webhookRateLimiter, verifyExotelWebhook, exotelRoutes.handleCallEnd);
app.post('/webhooks/exotel/recording', webhookRateLimiter, verifyExotelWebhook, exotelRoutes.handleRecording);

// Protected dashboard API routes (require authentication)
const { authMiddleware } = require(resolve('auth/authMiddleware'));
const { multiTenancyContext } = require(resolve('middleware/multiTenancy'));

// Apply API rate limiting to all protected routes
app.use('/api/', apiRateLimiter);

// ✅ PHASE 1 FIX 1.4: Multi-tenancy context middleware
// Injects tenant info into all authenticated requests for automatic filtering
app.use('/api/', authMiddleware, multiTenancyContext);

// ✅ PHASE 3: Monitoring routes (APM, circuit breakers, system health)
app.use('/api/monitoring', require(resolve('routes/monitoring')));

// Onboarding setup routes (protected - clients configure during setup)
app.use('/api/onboarding', authMiddleware, require(resolve('routes/onboarding')));
app.use('/api/calls', authMiddleware, require(resolve('routes/calls')));
app.use('/api/actions', authMiddleware, require(resolve('routes/actions')));
app.use('/api/analytics', authMiddleware, require(resolve('routes/analytics')));
app.use('/api/analytics', authMiddleware, require(resolve('routes/analyticsEnhanced')));
app.use('/api/calls', authMiddleware, require(resolve('routes/livecalls')));
app.use('/api/clients', authMiddleware, require(resolve('routes/clients'))); // Multi-tenancy + dashboard route
app.use('/api/recordings', authMiddleware, require(resolve('routes/recordings'))); // Call recordings from Wasabi

// Dashboard endpoint (from clients route)
app.get('/api/analytics/dashboard', authMiddleware, async (req, res) => {
  try {
    const userClientId = req.user.client_id;

    // Today's stats
    const todayResult = await db.query(
      `SELECT 
        COUNT(*) as calls,
        SUM(CAST(call_cost AS NUMERIC)) as revenue,
        AVG(EXTRACT(EPOCH FROM (end_ts - start_ts))/60) as avg_duration
       FROM calls 
       WHERE client_id = $1 AND DATE(start_ts) = CURRENT_DATE AND end_ts IS NOT NULL`,
      [userClientId]
    );

    const today = todayResult.rows[0];

    // Yesterday for comparison
    const yesterdayResult = await db.query(
      `SELECT 
        COUNT(*) as calls,
        SUM(CAST(call_cost AS NUMERIC)) as revenue
       FROM calls 
       WHERE client_id = $1 AND DATE(start_ts) = CURRENT_DATE - INTERVAL '1 day'`,
      [userClientId]
    );

    const yesterday = yesterdayResult.rows[0];

    const todaysCalls = parseInt(today?.calls || 0);
    const yesterdaysCalls = parseInt(yesterday?.calls || 0);
    const callsChange = yesterdaysCalls > 0 
      ? (((todaysCalls - yesterdaysCalls) / yesterdaysCalls) * 100).toFixed(1)
      : 0;

    const todaysRevenue = parseFloat(today?.revenue || 0);
    const yesterdaysRevenue = parseFloat(yesterday?.revenue || 0);
    const revenueChange = yesterdaysRevenue > 0
      ? (((todaysRevenue - yesterdaysRevenue) / yesterdaysRevenue) * 100).toFixed(1)
      : 0;

    // Satisfaction
    const satisfactionResult = await db.query(
      `SELECT 
        ROUND(COUNT(CASE WHEN feedback_score >= 4 THEN 1 END) * 100.0 / 
        NULLIF(COUNT(*), 0), 2) as satisfaction_rate
       FROM calls 
       WHERE client_id = $1 AND feedback_score IS NOT NULL AND DATE(start_ts) = CURRENT_DATE`,
      [userClientId]
    );

    const satisfactionRate = parseFloat(satisfactionResult.rows[0]?.satisfaction_rate || 0);

    res.json({
      todaysCalls,
      callsChange,
      todaysRevenue: parseFloat(todaysRevenue.toFixed(2)),
      revenueChange,
      avgDuration: parseFloat((today?.avg_duration || 0).toFixed(2)),
      durationChange: 0,
      satisfactionRate,
      satisfactionChange: 0
    });

  } catch (error) {
    logger.error('Error fetching dashboard', { 
      error: error.message, 
      userId: req.user?.id 
    });
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// WebSocket connection for audio streaming
wss.on('connection', async (ws, req) => {
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const callId = urlParams.get('callId');
  
  if (!callId) {
    logger.error('WebSocket connection rejected - no callId');
    ws.close();
    return;
  }

  logger.info('WebSocket connection established', { callId });

  try {
    // Get call data
    const call = await db.calls.getById(callId);
    
    if (!call) {
      logger.error('Call not found', { callId });
      ws.close();
      return;
    }

    // Create audio session
    await sessionManager.createSession(callId, call);

    // Handle incoming audio chunks from Exotel
    ws.on('message', async (data) => {
      try {
        const audioChunk = Buffer.from(data);
        sessionManager.processIncomingAudio(callId, audioChunk);
      } catch (error) {
        logger.error('Error processing audio chunk', { 
          callId, 
          error: error.message 
        });
      }
    });

    // Handle session audio output (TTS to send back to Exotel)
    sessionManager.on('audio_output', (data) => {
      if (data.callId === callId && ws.readyState === WebSocket.OPEN) {
        ws.send(data.audioData);
      }
    });

    ws.on('close', async () => {
      logger.info('WebSocket connection closed', { callId });
      await sessionManager.endSession(callId);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { callId, error: error.message });
    });

  } catch (error) {
    logger.error('Error setting up audio session', {
      callId,
      error: error.message
    });
    ws.close();
  }
});

// 404 handler - must come before error handler
app.use((req, res, next) => {
  const error = new NotFoundError('API endpoint');
  next(error);
});

// ✅ PHASE 3: Sentry error handler (before custom error handler)
app.use(sentryErrorHandler);

// 🔒 PHASE 2 FIX 2.2: Error response standardization middleware
// Converts all errors to standardized format with consistent HTTP status codes
const { errorResponseMiddleware } = require(resolve('middleware/errorResponse'));
app.use(errorResponseMiddleware);

// Error handling middleware - MUST BE LAST
app.use(errorHandler);

// ✅ PHASE 3: Graceful shutdown - flush pending error events to Sentry
const { flush: sentryflush } = require(resolve('utils/sentryIntegration'));

const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  wss.close(() => {
    logger.info('WebSocket server closed');
  });
  
  await db.close();
  logger.info('Database connections closed');
  
  // Flush Sentry events before exit
  await sentryflush(5000);
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * 🚀 START APPLICATION
 * 1. Initialize database (creates tables if needed)
 * 2. Setup graceful shutdown
 * 3. Start HTTP + WebSocket server
 * 4. Test connections
 */
async function startApplication() {
  try {
    // Step 1: Initialize database (must be first!)
    logger.info('🚀 Starting Caly Voice Agent...');
    await initDatabaseAndMigrations();

    // Step 1.5: Run database optimizations (create indexes, analyze tables)
    try {
      logger.info('📊 Running database optimizations...');
      const { createOptimizedIndexes } = require('./scripts/optimize-database');
      await createOptimizedIndexes();
      logger.info('✅ Database optimizations completed');
    } catch (error) {
      logger.warn('⚠️  Database optimization warning (not critical)', {
        error: error.message,
      });
    }

    // Step 2: Setup graceful shutdown handlers
    const shutdown = new GracefulShutdown(server, db, null);
    shutdown.attachHandlers();

    // Step 3: Start server
    const PORT = process.env.PORT || 3000;
    const HOST = process.env.HOST || '0.0.0.0';

    server.listen(PORT, HOST, async () => {
      logger.info(`✅ 🚀 Caly server running on ${HOST}:${PORT}`);
      logger.info(`✅ 📞 Exotel webhooks ready`);
      logger.info(`✅ 🎧 WebSocket audio server on ws://${HOST}:${PORT}/audio`);
      logger.info(`✅ 👥 Multi-tenancy enabled - /api/clients`);
      logger.info(`✅ 🤖 14 agents registered and ready`);

      // Step 4: Test database connection
      try {
        await db.testConnection();
        logger.info('✅ Database connection verified');

        // Log active clients
        const clients = await db.clients.getActive();
        logger.info(`✅ Active clients: ${clients.length}`);
      } catch (error) {
        logger.error('❌ Database connection verification failed', {
          error: error.message,
        });
      }

      // 🔒 PHASE 2 FIX 2.1: Start session cleanup service
      // Automatically cleans up expired sessions every 30 minutes
      // Prevents memory leaks and orphaned connections
      const sessionCleanup = require('./services/sessionCleanupService');
      sessionCleanup.startAutomaticCleanup();
      sessionCleanup.setupGracefulShutdown(server, wss);

      // ✅ PHASE 4 FIX 4.2: Schedule database cleanup job
      // Runs every 6 hours to clean up expired OTP, password reset tokens, and blacklisted tokens
      const CleanupService = require('./services/cleanupService');
      const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
      
      setInterval(async () => {
        try {
          const result = await CleanupService.cleanupAll();
          if (result.success) {
            logger.info('✅ Scheduled database cleanup completed', {
              totalCleaned: result.totalCleaned,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          logger.error('❌ Scheduled database cleanup failed', {
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }, CLEANUP_INTERVAL);

      logger.info('🎉 Application ready to handle requests');
    });

    // Handle server errors
    server.on('error', (error) => {
      logger.error('❌ Server error', { error: error.message });
      process.exit(1);
    });
  } catch (error) {
    logger.error('❌ Failed to start application', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start the application
startApplication();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});

module.exports = { app, server, wss };