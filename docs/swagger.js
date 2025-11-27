/**
 * Swagger/OpenAPI Configuration
 * Auto-generates API documentation
 * Provides interactive API explorer via /api/docs
 * 
 * Usage in server.js:
 *   const swaggerDocs = require('./docs/swagger');
 *   swaggerDocs(app);
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

/**
 * Swagger/OpenAPI 3.0 definition
 * Includes all API endpoints with request/response schemas
 */
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Caly Voice AI Agent API',
      version: '1.0.0',
      description: 'Complete REST API for Caly - AI-powered voice support agent for e-commerce',
      contact: {
        name: 'Caly Support',
        email: 'support@caly.ai',
      },
      license: {
        name: 'PROPRIETARY',
      },
    },
    servers: [
      {
        url: process.env.API_URL || `http://localhost:${process.env.PORT || 8080}`,
        description: 'Development Server',
      },
      {
        url: 'https://api.caly.ai',
        description: 'Production Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Token obtained from /api/auth/login',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API Key for service-to-service authentication',
        },
      },
      schemas: {
        // Common response schemas
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message' },
            code: { type: 'string', description: 'Error code for programmatic handling' },
            details: { type: 'object', description: 'Additional error details' },
          },
          required: ['error'],
        },
        PaginationMetadata: {
          type: 'object',
          properties: {
            page: { type: 'integer', description: 'Current page number (1-indexed)' },
            limit: { type: 'integer', description: 'Items per page' },
            total: { type: 'integer', description: 'Total number of items' },
            totalPages: { type: 'integer', description: 'Total number of pages' },
            hasMore: { type: 'boolean', description: 'Whether more pages exist' },
            offset: { type: 'integer', description: 'Offset from start' },
          },
        },
        // Auth schemas
        LoginRequest: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', format: 'password', example: 'securePassword123' },
          },
          required: ['email', 'password'],
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT access token' },
            expiresIn: { type: 'string', example: '24h' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                email: { type: 'string' },
                name: { type: 'string' },
                client_id: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
        // Call schemas
        Call: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Call unique identifier' },
            client_id: { type: 'string', format: 'uuid', description: 'Client/company ID' },
            phone_from: { type: 'string', description: 'Caller phone number' },
            phone_to: { type: 'string', description: 'Recipient phone number' },
            start_ts: { type: 'string', format: 'date-time', description: 'Call start time' },
            end_ts: { type: 'string', format: 'date-time', description: 'Call end time' },
            duration: { type: 'integer', description: 'Call duration in seconds' },
            transcript: { type: 'string', description: 'Speech-to-text transcript' },
            resolved: { type: 'boolean', description: 'Whether call was resolved by AI' },
            confidence: { type: 'number', description: 'AI confidence score (0-1)' },
            intent: { type: 'string', description: 'Detected intent (order_lookup, returns, etc)' },
            recording_url: { type: 'string', format: 'uri', description: 'URL to call recording' },
            cost: { type: 'number', description: 'Call cost in USD' },
          },
        },
        CallsList: {
          type: 'object',
          properties: {
            calls: {
              type: 'array',
              items: { $ref: '#/components/schemas/Call' },
            },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasMore: { type: 'boolean' },
          },
        },
        // Health check
        HealthStatus: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'degraded', 'down'] },
            timestamp: { type: 'string', format: 'date-time' },
            database: { type: 'boolean', description: 'Database connection status' },
            redis: { type: 'boolean', description: 'Redis connection status' },
            exotel: { type: 'boolean', description: 'Exotel integration status' },
          },
        },
      },
    },
    security: [
      { bearerAuth: [] },
    ],
  },
  apis: ['./routes/*.js', './middleware/*.js'],
};

const specs = swaggerJsdoc(options);

/**
 * Setup Swagger UI
 * @param {Object} app - Express app instance
 */
module.exports = function setupSwagger(app) {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      swaggerOptions: {
        persistAuthorization: true,
        displayOperationId: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
      },
      customCss: `
        .swagger-ui {
          background: #f5f5f5;
        }
        .swagger-ui .topbar {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .swagger-ui .info .title {
          color: #667eea;
        }
      `,
      customSiteTitle: 'Caly API Documentation',
    })
  );

  // Also serve raw OpenAPI spec as JSON
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  console.log('✓ Swagger UI available at http://localhost:8080/api/docs');
};
