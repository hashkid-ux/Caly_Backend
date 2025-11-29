/**
 * Test Setup and Configuration
 * Configures Jest environment for integration testing
 */

const dotenv = require('dotenv');
const path = require('path');

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Global timeout for all tests
jest.setTimeout(30000);

// Mock logger to reduce noise during tests
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock Sentry to prevent errors during tests
jest.mock('../utils/sentryIntegration', () => ({
  initSentry: jest.fn(),
  getSentryMiddleware: () => (req, res, next) => next(),
  captureException: jest.fn(),
  flush: jest.fn(),
}));

module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'routes/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
  ],
};
