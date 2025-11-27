/**
 * HTTPS & Security Headers Middleware
 * Enforces HTTPS, sets security headers, and implements best practices
 */

/**
 * HTTPS redirect middleware
 * Forces all HTTP requests to HTTPS (production only)
 * 🔒 SECURITY FIX 5: Proper HTTPS enforcement even behind proxy
 */
const httpsRedirect = (req, res, next) => {
  // Skip for health checks and internal requests
  if (req.path.includes('/health')) {
    return next();
  }

  // Check if already HTTPS (handle proxy case with X-Forwarded-Proto)
  const isSecure = req.protocol === 'https' || 
                   req.headers['x-forwarded-proto'] === 'https';

  // Enforce HTTPS in production
  if (process.env.NODE_ENV === 'production' && !isSecure) {
    const url = `https://${req.get('host')}${req.url}`;
    return res.redirect(301, url);
  }

  next();
};

/**
 * Strict Transport Security (HSTS) header
 * Tells browsers to always use HTTPS for this domain
 * Prevents man-in-the-middle attacks
 */
const hstsHeader = (req, res, next) => {
  // max-age: 31536000 = 1 year
  // includeSubDomains: applies to all subdomains
  // preload: allows browser to preload the domain
  if (process.env.NODE_ENV === 'production') {
    res.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  next();
};

/**
 * Content Security Policy (CSP) header
 * Controls which resources can be loaded
 * Prevents XSS attacks
 * 🔒 SECURITY FIX 6: Removed unsafe-inline and unsafe-eval for production security
 */
const cspHeader = (req, res, next) => {
  // CSP policy: restrict content sources (no unsafe-inline in production)
  const policy = [
    "default-src 'self'", // Default: only same-origin
    "script-src 'self' https://cdn.tailwindcss.com", // Scripts (removed unsafe-inline/eval)
    "style-src 'self' https://fonts.googleapis.com", // Styles (removed unsafe-inline)
    "img-src 'self' data: https:", // Images
    "font-src 'self' https://fonts.gstatic.com", // Fonts
    "connect-src 'self' wss: https://api.openai.com https://api.exotel.com https://calybackend-production.up.railway.app", // API calls
    "media-src 'self'", // Audio/video
    "object-src 'none'", // Plugins
    "frame-ancestors 'none'", // No embedded frames
    "base-uri 'self'", // Base URL
    "form-action 'self'", // Form submissions
    "upgrade-insecure-requests", // Upgrade HTTP to HTTPS
  ].join('; ');

  res.set('Content-Security-Policy', policy);

  next();
};

/**
 * X-Frame-Options header
 * Prevents clickjacking attacks
 */
const frameOptionsHeader = (req, res, next) => {
  res.set('X-Frame-Options', 'DENY'); // Deny all framing
  next();
};

/**
 * X-Content-Type-Options header
 * Prevents MIME-type sniffing
 */
const contentTypeHeader = (req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  next();
};

/**
 * X-XSS-Protection header
 * Legacy XSS protection (modern browsers use CSP)
 */
const xssProtectionHeader = (req, res, next) => {
  res.set('X-XSS-Protection', '1; mode=block');
  next();
};

/**
 * Referrer-Policy header
 * Controls referrer information
 */
const referrerPolicyHeader = (req, res, next) => {
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
};

/**
 * Permissions-Policy header (formerly Feature-Policy)
 * Disable unused browser features
 */
const permissionsPolicyHeader = (req, res, next) => {
  const policy = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', ');

  res.set('Permissions-Policy', policy);
  next();
};

/**
 * Remove X-Powered-By header
 * Don't advertise server technology
 */
const removeServerHeader = (req, res, next) => {
  res.removeHeader('X-Powered-By');
  next();
};

/**
 * Combined security headers middleware
 * Applies all security headers at once
 */
const securityHeaders = (req, res, next) => {
  // HSTS
  if (process.env.NODE_ENV === 'production') {
    res.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // 🔒 CSP - FIXED to remove unsafe-inline and unsafe-eval
  const policy = [
    "default-src 'self'",
    "script-src 'self' https://cdn.tailwindcss.com",
    "style-src 'self' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' wss: https://api.openai.com https://api.exotel.com https://calybackend-production.up.railway.app",
    "media-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
  res.set('Content-Security-Policy', policy);

  // Clickjacking protection
  res.set('X-Frame-Options', 'DENY');

  // MIME type sniffing protection
  res.set('X-Content-Type-Options', 'nosniff');

  // XSS protection (legacy)
  res.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  const permissionsPolicy = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', ');
  res.set('Permissions-Policy', permissionsPolicy);

  // Hide server info
  res.removeHeader('X-Powered-By');

  next();
};

/**
 * Combined HTTPS + Headers middleware
 * Applies both HTTPS redirect and all security headers
 */
const enforceSecurityHeaders = [
  httpsRedirect,
  securityHeaders,
];

module.exports = {
  // Individual middleware
  httpsRedirect,
  hstsHeader,
  cspHeader,
  frameOptionsHeader,
  contentTypeHeader,
  xssProtectionHeader,
  referrerPolicyHeader,
  permissionsPolicyHeader,
  removeServerHeader,

  // Combined middleware
  securityHeaders,
  enforceSecurityHeaders,
};
