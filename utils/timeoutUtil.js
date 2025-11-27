// Backend/utils/timeoutUtil.js - Timeout wrapper for external APIs
const logger = require('./logger');

/**
 * Wrap a promise with a timeout
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of operation for logging
 * @returns {Promise} - Original promise or timeout error
 */
function withTimeout(promise, timeoutMs, operationName = 'API call') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      // Cleanup timeout on promise completion
      promise
        .then(() => clearTimeout(timeoutId))
        .catch(() => clearTimeout(timeoutId));
    })
  ]);
}

/**
 * Execute async function with timeout and retry
 * @param {Function} fn - Async function to execute
 * @param {number} timeoutMs - Timeout per attempt (ms)
 * @param {number} maxRetries - Max retry attempts (default: 2)
 * @param {string} operationName - Name for logging
 * @returns {Promise} - Function result or error
 */
async function executeWithTimeoutAndRetry(
  fn,
  timeoutMs = 30000,
  maxRetries = 2,
  operationName = 'API call'
) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`${operationName} attempt ${attempt + 1}/${maxRetries + 1}`, {
        timeoutMs,
        operationName
      });
      
      const result = await withTimeout(fn(), timeoutMs, operationName);
      return result;
      
    } catch (error) {
      lastError = error;
      const isTimeoutError = error.message.includes('timed out');
      const isLastAttempt = attempt === maxRetries;
      
      if (isTimeoutError && !isLastAttempt) {
        logger.warn(`${operationName} timeout, retrying...`, {
          attempt: attempt + 1,
          maxRetries,
          error: error.message
        });
        // Continue to next attempt
        continue;
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}

/**
 * Create axios timeout config
 * @param {number} timeoutMs - Request timeout in ms
 * @returns {Object} - Axios config for timeout
 */
function createAxiosTimeout(timeoutMs = 30000) {
  return {
    timeout: timeoutMs,
    timeoutErrorMessage: `Request timed out after ${timeoutMs}ms`
  };
}

module.exports = {
  withTimeout,
  executeWithTimeoutAndRetry,
  createAxiosTimeout
};
