/**
 * Sentry Integration - Centralized error tracking and monitoring
 * 
 * Features:
 * - Captures uncaught exceptions and promise rejections
 * - Tracks request context (user, request ID, API path)
 * - Breadcrumb tracking for debugging
 * - Performance monitoring (tracing)
 * - Environment-based filtering (production only)
 * - Secure PII handling
 */

const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');

/**
 * Initialize Sentry for error tracking
 * Only active in production or if SENTRY_DSN explicitly set
 */
function initSentry() {
  const sentryDsn = process.env.SENTRY_DSN;
  const isEnabled = process.env.NODE_ENV === 'production' || (sentryDsn && process.env.ENABLE_SENTRY === 'true');

  if (!isEnabled) {
    console.log('[Sentry] Disabled - Set SENTRY_DSN and ENABLE_SENTRY=true to enable');
    return { initialized: false };
  }

  if (!sentryDsn) {
    console.warn('[Sentry] SENTRY_DSN not set - error tracking disabled');
    return { initialized: false };
  }

  try {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      integrations: [
        new ProfilingIntegration(),
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({
          request: true,
          serverName: false,
        }),
      ],
      // Secure PII handling - filter sensitive data
      beforeSend(event, hint) {
        // Remove sensitive headers
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
          delete event.request.headers['x-api-key'];
        }

        // Remove sensitive query parameters
        if (event.request?.url) {
          const url = new URL(event.request.url);
          ['token', 'apikey', 'password', 'secret'].forEach(param => {
            if (url.searchParams.has(param)) {
              url.searchParams.set(param, '[REDACTED]');
            }
          });
          event.request.url = url.toString();
        }

        // Filter breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map(crumb => {
            if (crumb.data?.url) {
              const url = new URL(crumb.data.url);
              ['token', 'apikey', 'password', 'secret'].forEach(param => {
                if (url.searchParams.has(param)) {
                  url.searchParams.set(param, '[REDACTED]');
                }
              });
              crumb.data.url = url.toString();
            }
            return crumb;
          });
        }

        return event;
      },
      // Ignore certain errors
      ignoreErrors: [
        // Browser extensions
        'top.GLOBALS',
        // Random plugins/extensions
        'chrome-extension://',
        'moz-extension://',
        // See http://blog.errorception.com/2012/03/tale-of-unfindable-js-error.html
        'originalCreateNotification',
        'canvas.contentDocument',
        'MyApp_RemoveAllHighlights',
        // Facebook flakiness
        'fb_xd_fragment',
        // ISP optimizing proxy - `Cache-Control: no-transform`; see http://stackoverflow.com/questions/4113268
        'bmi_SafeAddOnload',
        'EBCallBackMessageReceived',
        // See http://toolbar.conduit.com/Developer/HtmlAndGadget/Methods/JSInjection.aspx
        'conduitPage',
        // Generic error messages that aren't actionable
        'Error: Script error.',
        'NetworkError',
        'Network request failed',
        'fetch failed',
      ],
    });

    console.log('✅ [Sentry] Initialized - Error tracking enabled');
    return { initialized: true, Sentry };
  } catch (error) {
    console.error('❌ [Sentry] Initialization failed', error.message);
    return { initialized: false };
  }
}

/**
 * Express middleware for Sentry request tracking
 */
function getSentryMiddleware() {
  return {
    requestHandler: Sentry.Handlers.requestHandler(),
    errorHandler: Sentry.Handlers.errorHandler(),
  };
}

/**
 * Capture an error with context
 */
function captureError(error, context = {}) {
  if (!Sentry.isInitialized?.()) {
    return;
  }

  Sentry.captureException(error, {
    tags: {
      errorType: error.name || 'UnknownError',
      ...context.tags,
    },
    extra: {
      timestamp: new Date().toISOString(),
      ...context.extra,
    },
    user: context.user,
  });
}

/**
 * Capture a message with severity
 */
function captureMessage(message, level = 'info', context = {}) {
  if (!Sentry.isInitialized?.()) {
    return;
  }

  Sentry.captureMessage(message, level, {
    tags: context.tags,
    extra: context.extra,
  });
}

/**
 * Add breadcrumb for tracing
 */
function addBreadcrumb(message, data = {}) {
  if (!Sentry.isInitialized?.()) {
    return;
  }

  Sentry.addBreadcrumb({
    category: data.category || 'user-action',
    message,
    level: data.level || 'info',
    data: data.data || {},
  });
}

/**
 * Set user context for error tracking
 */
function setUserContext(userId, email = null, extra = {}) {
  if (!Sentry.isInitialized?.()) {
    return;
  }

  Sentry.setUser({
    id: userId,
    email,
    ...extra,
  });
}

/**
 * Clear user context
 */
function clearUserContext() {
  if (!Sentry.isInitialized?.()) {
    return;
  }

  Sentry.setUser(null);
}

/**
 * Set tags for categorizing errors
 */
function setTag(key, value) {
  if (!Sentry.isInitialized?.()) {
    return;
  }

  Sentry.setTag(key, value);
}

/**
 * Flush pending events before shutdown (graceful shutdown)
 */
async function flush(timeout = 5000) {
  if (!Sentry.isInitialized?.()) {
    return;
  }

  try {
    console.log('[Sentry] Flushing pending events...');
    await Sentry.close(timeout);
    console.log('✅ [Sentry] Events flushed');
  } catch (error) {
    console.error('❌ [Sentry] Flush error', error.message);
  }
}

module.exports = {
  initSentry,
  getSentryMiddleware,
  captureError,
  captureMessage,
  addBreadcrumb,
  setUserContext,
  clearUserContext,
  setTag,
  flush,
  Sentry,
};
