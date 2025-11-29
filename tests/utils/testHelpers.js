/**
 * Test Utilities - Shared testing helpers
 * Provides common functions for all integration tests
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a valid JWT token for testing
 */
function generateTestToken(clientId = null, userId = null, expiresIn = '24h') {
  const payload = {
    client_id: clientId || `client-${uuidv4()}`,
    sub: userId || `user-${uuidv4()}`,
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', {
    expiresIn,
  });
}

/**
 * Generate mock team data
 */
function generateMockTeam(overrides = {}) {
  return {
    id: uuidv4(),
    client_id: `client-${uuidv4()}`,
    name: `Test Team ${Math.random().toString(36).substring(7)}`,
    sector: 'healthcare',
    description: 'Test team for integration testing',
    status: 'active',
    member_count: 5,
    satisfaction_score: 4.5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate mock member data
 */
function generateMockMember(teamId, overrides = {}) {
  return {
    id: uuidv4(),
    team_id: teamId,
    user_id: uuidv4(),
    title: 'Support Specialist',
    role: 'member',
    agent_count: 3,
    success_rate: 0.85,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate mock agent assignment data
 */
function generateMockAgentAssignment(teamId, memberId, overrides = {}) {
  return {
    id: uuidv4(),
    team_id: teamId,
    member_id: memberId,
    agent_type: 'healthcare_support',
    proficiency_level: 75,
    success_rate: 0.88,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate mock performance data
 */
function generateMockPerformance(teamId, overrides = {}) {
  return {
    team_id: teamId,
    date: new Date().toISOString().split('T')[0],
    total_calls: 150,
    completed_calls: 135,
    failed_calls: 15,
    avg_satisfaction: 4.3,
    resolution_rate: 90,
    avg_call_duration: 420, // seconds
    ...overrides,
  };
}

/**
 * Sleep for milliseconds (useful for waiting in tests)
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function n times with exponential backoff
 */
async function retry(fn, maxRetries = 3, delayMs = 100) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      await sleep(delayMs * Math.pow(2, i));
    }
  }
}

/**
 * Assert that a database query was properly parameterized
 */
function assertParameterized(query, params) {
  // Check that query doesn't contain literal values
  const literalValuePattern = /'[^']*'/g;
  const matches = query.match(literalValuePattern);

  if (matches && matches.length > 0) {
    throw new Error(
      `Query contains literal values instead of parameters: ${matches.join(
        ', '
      )}`
    );
  }

  // Verify params are provided
  if (!params || params.length === 0) {
    throw new Error('Query parameters are missing');
  }
}

/**
 * Assert multi-tenant isolation
 */
function assertMultiTenantIsolation(result, expectedClientId) {
  if (Array.isArray(result)) {
    result.forEach((item) => {
      if (item.client_id && item.client_id !== expectedClientId) {
        throw new Error(
          `Data leak detected: client_id mismatch (expected: ${expectedClientId}, got: ${item.client_id})`
        );
      }
    });
  } else if (result && result.client_id && result.client_id !== expectedClientId) {
    throw new Error(
      `Data leak detected: client_id mismatch (expected: ${expectedClientId}, got: ${result.client_id})`
    );
  }
}

/**
 * Create a test context with pre-configured values
 */
function createTestContext() {
  const clientId = `client-${uuidv4()}`;
  const userId = `user-${uuidv4()}`;
  const token = generateTestToken(clientId, userId);

  return {
    clientId,
    userId,
    token,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}

/**
 * Verify API response structure
 */
function assertApiResponse(response, expectedStatus, expectedFields = []) {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}`
    );
  }

  if (response.body) {
    expectedFields.forEach((field) => {
      if (!(field in response.body)) {
        throw new Error(`Missing expected field: ${field}`);
      }
    });
  }
}

/**
 * Batch create test data
 */
async function batchCreateTeams(count, clientId) {
  const teams = [];
  for (let i = 0; i < count; i++) {
    teams.push(
      generateMockTeam({
        client_id: clientId,
        name: `Test Team ${i + 1}`,
        sector: ['healthcare', 'retail', 'finance', 'education'][i % 4],
      })
    );
  }
  return teams;
}

module.exports = {
  generateTestToken,
  generateMockTeam,
  generateMockMember,
  generateMockAgentAssignment,
  generateMockPerformance,
  sleep,
  retry,
  assertParameterized,
  assertMultiTenantIsolation,
  createTestContext,
  assertApiResponse,
  batchCreateTeams,
};
