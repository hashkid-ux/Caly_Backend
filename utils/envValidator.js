/**
 * Environment Variable Validator
 * Validates all required env vars at startup
 * Prevents app from crashing due to missing configuration
 * Logs helpful error messages if validation fails
 */

class EnvValidator {
  constructor() {
    this.requiredVars = {
      // Critical vars (app won't work without these)
      NODE_ENV: { required: true, values: ['development', 'production', 'test'] },
      PORT: { required: true, type: 'number' },
      DATABASE_URL: { required: true },
      JWT_SECRET: { required: true, minLength: 32 },
      SESSION_SECRET: { required: true, minLength: 32 },
      ENCRYPTION_KEY: { required: true, minLength: 64 },
      OPENAI_API_KEY: { required: true },

      // Optional vars (have defaults or are non-critical)
      LOG_LEVEL: { required: false, default: 'info', values: ['error', 'warn', 'info', 'debug'] },
      REDIS_URL: { required: false, default: 'redis://localhost:6379' },
      JWT_EXPIRY: { required: false, default: '24h' },
      EXOTEL_SID: { required: false },
      EXOTEL_TOKEN: { required: false },
      SHOPIFY_API_KEY: { required: false },
      WASABI_ACCESS_KEY_ID: { required: false },
      WASABI_SECRET_ACCESS_KEY: { required: false },
      WASABI_BUCKET_NAME: { required: false },
      WASABI_REGION: { required: false, default: 'us-west-1' },
      WASABI_ENDPOINT: { required: false, default: 'https://s3.us-west-1.wasabisys.com' },
      SENTRY_DSN: { required: false },
    };

    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate all environment variables
   * @throws {Error} If critical variables are missing
   * @returns {boolean} True if validation passed
   */
  validate() {
    this.errors = [];
    this.warnings = [];

    Object.entries(this.requiredVars).forEach(([key, config]) => {
      const value = process.env[key];

      // Check if required var is missing
      if (config.required && !value) {
        this.errors.push(`Missing critical env var: ${key}`);
        return;
      }

      // Skip validation for missing optional vars
      if (!value && !config.required) {
        if (config.default) {
          process.env[key] = config.default;
          this.warnings.push(`Using default for ${key}: ${config.default}`);
        }
        return;
      }

      // Validate type
      if (config.type === 'number' && isNaN(Number(value))) {
        this.errors.push(`${key} must be a number, got: ${value}`);
        return;
      }

      // Validate allowed values (enum)
      if (config.values && !config.values.includes(value)) {
        this.errors.push(
          `${key} must be one of: ${config.values.join(', ')}, got: ${value}`
        );
        return;
      }

      // Validate minimum length
      if (config.minLength && value.length < config.minLength) {
        this.errors.push(
          `${key} must be at least ${config.minLength} characters, got ${value.length}`
        );
        return;
      }

      // Validate URL format
      if (key.includes('URL') && !this.isValidUrl(value)) {
        this.warnings.push(`${key} does not appear to be a valid URL: ${value}`);
      }
    });

    // Report results
    if (this.errors.length > 0) {
      console.error('\n❌ Environment Validation FAILED\n');
      this.errors.forEach(err => console.error(`  ✗ ${err}`));
      console.error(
        '\nFix these errors and restart. See .env.example for required variables.\n'
      );
      throw new Error('Environment validation failed');
    }

    if (this.warnings.length > 0) {
      console.warn('\n⚠️  Environment Validation Warnings\n');
      this.warnings.forEach(warn => console.warn(`  ⚠ ${warn}`));
    }

    console.log('✓ Environment validation passed\n');
    return true;
  }

  /**
   * Simple URL validation
   * @private
   */
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Get a required env var with fallback
   * @param {string} key - Environment variable name
   * @param {*} defaultValue - Value to return if env var not set
   * @returns {*} Environment variable value or default
   */
  get(key, defaultValue) {
    return process.env[key] || defaultValue;
  }
}

// Export singleton
const validator = new EnvValidator();

module.exports = validator;
