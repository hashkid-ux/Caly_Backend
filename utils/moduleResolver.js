/**
 * Module Resolver - Handles absolute/relative path resolution across environments
 * Fixes MODULE_NOT_FOUND errors on Railway where directory structure differs
 * 
 * Usage:
 *   const logger = require(resolve('utils/logger'));
 *   const db = require(resolve('db/postgres'));
 */

const path = require('path');

/**
 * Resolve module path - Works in both local dev and Railway production
 * @param {string} modulePath - Relative path like 'utils/logger' or 'agents/orchestrator'
 * @returns {string} Absolute path to the module
 */
function resolve(modulePath) {
  // Get the root backend directory
  const backendRoot = path.join(__dirname, '..');
  
  // Join with the requested module path and add .js extension if missing
  let fullPath = path.join(backendRoot, modulePath);
  if (!fullPath.endsWith('.js')) {
    fullPath += '.js';
  }
  
  return fullPath;
}

module.exports = resolve;
