// Backend/config/timeoutConfig.js - Timeout configuration for all external APIs
/**
 * TIMEOUT STRATEGY for Production Resilience
 * 
 * Why timeouts matter:
 * - Prevents requests from hanging indefinitely
 * - Allows clients to retry after exponential backoff
 * - Protects against slow APIs and network issues
 * - Prevents connection pool exhaustion
 * 
 * Timeout Hierarchy:
 * 1. Global Express timeout (35 seconds) - applies to ALL requests
 * 2. Specific service timeouts below (30-60 seconds) - per API
 * 3. Frontend fetch timeout (10 seconds) - user-perceived delay
 */

const TIMEOUTS = {
  // 🔒 GLOBAL SERVER TIMEOUT (Express middleware in server.js)
  GLOBAL_REQUEST_TIMEOUT: 35000, // 35 seconds - all HTTP requests
  GLOBAL_SOCKET_TIMEOUT: 35000, // 35 seconds - socket level
  
  // 🔒 FRONTEND TIMEOUTS (Frontend/src/utils/axiosInstance.js)
  AXIOS_REQUEST_TIMEOUT: 30000, // 30 seconds - all API calls
  AXIOS_RETRY_DELAY: 1000, // 1 second initial delay, exponential backoff
  AXIOS_MAX_RETRIES: 3, // Retry up to 3 times on transient errors
  
  // 🔒 EXTERNAL API TIMEOUTS
  OPENAI_TIMEOUT: 30000, // 30 seconds - OpenAI API calls
  OPENAI_REALTIME_TIMEOUT: 35000, // 35 seconds - WebSocket connections
  EXOTEL_TIMEOUT: 10000, // 10 seconds - Exotel API (usually fast)
  WASABI_UPLOAD_TIMEOUT: 60000, // 60 seconds - large file uploads
  WASABI_DOWNLOAD_TIMEOUT: 60000, // 60 seconds - large file downloads
  WASABI_DELETE_TIMEOUT: 30000, // 30 seconds - delete operations
  WASABI_LIST_TIMEOUT: 30000, // 30 seconds - list operations
  
  // 🔒 DATABASE TIMEOUTS
  DATABASE_QUERY_TIMEOUT: 30000, // 30 seconds - PostgreSQL queries
  DATABASE_CONNECTION_TIMEOUT: 5000, // 5 seconds - establish connection
  
  // 🔒 INTERNAL OPERATION TIMEOUTS
  SESSION_TIMEOUT: 15 * 60 * 1000, // 15 minutes - session inactivity
  LOGIN_TIMEOUT: 8000, // 8 seconds - login endpoint execution
  EMAIL_SEND_TIMEOUT: 10000, // 10 seconds - email sending
};

// Timeout Error Handling
const TIMEOUT_ERROR_MESSAGES = {
  GLOBAL_TIMEOUT: 'Request timeout. Please try again.',
  FRONTEND_TIMEOUT: 'Server took too long to respond. Please check your connection.',
  DATABASE_TIMEOUT: 'Database query timed out. Please try again.',
  LOGIN_TIMEOUT: 'Login took too long. Please check your internet connection.',
  EXTERNAL_API_TIMEOUT: (service) => `${service} took too long to respond. Please try again.`
};

module.exports = {
  TIMEOUTS,
  TIMEOUT_ERROR_MESSAGES
};
