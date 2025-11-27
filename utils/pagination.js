/**
 * Pagination Utility
 * Safely paginate large datasets
 * Prevents loading millions of records at once
 * Improves performance and user experience
 */

class Pagination {
  /**
   * Constructor
   * @param {number|string} page - Page number (1-indexed, default: 1)
   * @param {number|string} limit - Items per page (default: 50, max: 1000)
   * @param {number} maxLimit - Maximum allowed limit to prevent abuse
   */
  constructor(page = 1, limit = 50, maxLimit = 1000) {
    // Ensure page is at least 1
    this.page = Math.max(1, parseInt(page) || 1);
    
    // Ensure limit is between 1 and maxLimit
    this.limit = Math.min(
      Math.max(1, parseInt(limit) || 50),
      maxLimit
    );
    
    // Calculate offset for SQL queries
    this.offset = (this.page - 1) * this.limit;
    
    // Track max allowed limit
    this.maxLimit = maxLimit;
  }

  /**
   * Apply pagination to SQL query (PostgreSQL style)
   * @returns {string} SQL fragment for LIMIT/OFFSET
   * 
   * Usage: query += pagination.applySql();
   */
  applySql() {
    return ` LIMIT ${this.limit} OFFSET ${this.offset}`;
  }

  /**
   * Apply pagination to MongoDB/Mongoose query
   * @returns {Object} Skip and limit object
   * 
   * Usage: Model.find({}).skip(pagination.applyMongoose().skip).limit(pagination.applyMongoose().limit)
   */
  applyMongoose() {
    return {
      skip: this.offset,
      limit: this.limit,
    };
  }

  /**
   * Create pagination object from request query parameters
   * @static
   * @param {Object} query - Express request query object
   * @returns {Pagination} New pagination instance
   * 
   * Usage: const pagination = Pagination.fromQuery(req.query);
   */
  static fromQuery(query) {
    return new Pagination(query.page, query.limit);
  }

  /**
   * Generate pagination response metadata
   * Includes total pages, has-more flag, etc
   * @param {number} total - Total number of items in dataset
   * @returns {Object} Pagination metadata
   */
  getMetadata(total) {
    const totalPages = Math.ceil(total / this.limit);
    
    return {
      page: this.page,
      limit: this.limit,
      total,
      totalPages,
      hasMore: this.page < totalPages,
      offset: this.offset,
    };
  }

  /**
   * Express middleware for automatic pagination
   * Adds pagination object to request
   * @static
   * 
   * Usage: app.use(Pagination.middleware);
   */
  static middleware(req, res, next) {
    req.pagination = Pagination.fromQuery(req.query);
    next();
  }

  /**
   * Validate pagination parameters
   * @returns {Object} Validation result {valid: boolean, errors: string[]}
   */
  validate() {
    const errors = [];

    if (this.page < 1) {
      errors.push('Page must be >= 1');
    }

    if (this.limit < 1) {
      errors.push('Limit must be >= 1');
    }

    if (this.limit > this.maxLimit) {
      errors.push(`Limit must be <= ${this.maxLimit}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = Pagination;
