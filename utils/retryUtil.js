/**
 * Retry utility with exponential backoff
 * Used for external API calls (OpenAI, Wasabi, Exotel)
 */

const logger = require('./logger');

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @param {string} operationName - Name of operation for logging
 * @returns {Promise} Result of function
 */
const retryWithBackoff = async (
  fn,
  maxRetries = 3,
  initialDelayMs = 1000,
  operationName = 'Operation'
) => {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on 4xx errors (except 408 timeout, 429 rate limit)
      if (error.status && error.status >= 400 && error.status < 500) {
        if (error.status !== 408 && error.status !== 429) {
          throw error;
        }
      }

      if (attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(2, attempt);
        const jitterMs = Math.random() * 1000;
        const totalDelay = delayMs + jitterMs;

        logger.info(`${operationName} - retry ${attempt + 1}/${maxRetries} after ${Math.round(totalDelay)}ms`, {
          error: error.message,
          attempt: attempt + 1,
          maxRetries,
        });

        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
  }

  logger.error(`${operationName} failed after ${maxRetries} retries`, {
    error: lastError?.message,
  });

  throw lastError;
};

module.exports = { retryWithBackoff };
