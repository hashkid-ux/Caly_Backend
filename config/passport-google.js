/**
 * Passport Google OAuth 2.0 Configuration
 * Handles Google login/registration flow with proper error handling
 * 
 * FLOW:
 * 1. User clicks "Login with Google"
 * 2. Redirected to /api/auth/google
 * 3. Google OAuth strategy authenticates
 * 4. Verify callback either:
 *    - Updates existing user (same email or google_id)
 *    - Creates new client + user if first-time signup
 * 5. JWT token generated in oauth.js callback handler
 * 
 * CRITICAL FIXES:
 * - password_hash is now nullable (NULL for OAuth, hashed string for password users)
 * - Checks for duplicate client.email before creation (prevents constraint violations)
 * - Links to existing client if email already exists (handles account linking)
 * - Sets is_verified=true automatically for OAuth (Google verified the email)
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../db/postgres');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: (() => {
        if (process.env.NODE_ENV === 'production' && !process.env.GOOGLE_CALLBACK_URL) {
          throw new Error('❌ CRITICAL: GOOGLE_CALLBACK_URL must be set in production');
        }
        return process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8080/api/auth/google/callback';
      })(),
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;
        const googleId = profile.id;
        const picture = profile.photos?.[0]?.value;

        if (!email) {
          logger.warn('❌ Google OAuth - no email provided');
          return done(null, false, { message: 'No email provided by Google' });
        }

        logger.info('🔍 Google OAuth - authenticating user', { email, googleId });

        // Check if user exists by email or google_id
        const existingUser = await db.query(
          `SELECT * FROM users WHERE email = $1 OR google_id = $2`,
          [email, googleId]
        );

        if (existingUser.rows.length > 0) {
          // User exists - update google credentials
          const user = existingUser.rows[0];
          
          await db.query(
            `UPDATE users 
             SET google_id = $1, 
                 google_refresh_token = $2,
                 name = $3,
                 updated_at = NOW()
             WHERE id = $4`,
            [googleId, refreshToken, name, user.id]
          );

          logger.info('✅ Existing user authenticated via Google', {
            userId: user.id,
            email,
          });

          return done(null, user);
        }

        // Create new user - check if client email already exists first
        const newUserId = uuidv4();
        const newClientId = uuidv4();

        // CHECK 1: Verify client with this email doesn't already exist
        // (Edge case: if password user exists with same email but tries to create new OAuth account)
        const existingClient = await db.query(
          `SELECT id FROM clients WHERE email = $1`,
          [email]
        );

        if (existingClient.rows.length > 0) {
          // Client already exists - this email is taken
          // Instead of failing, we should link to existing client's company
          // but create user in that client
          logger.warn('⚠️  OAuth email matches existing client - linking to company', {
            email,
            clientId: existingClient.rows[0].id,
          });

          const existingClientId = existingClient.rows[0].id;

          // Create user in existing client
          const newUserResult = await db.query(
            `INSERT INTO users 
             (id, client_id, email, name, google_id, google_refresh_token, password_hash, is_active, is_verified, role, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NULL, true, true, 'user', NOW())
             RETURNING *`,
            [newUserId, existingClientId, email, name, googleId, refreshToken]
          );

          const newUser = newUserResult.rows[0];

          logger.info('✅ New user created via Google OAuth (linked to existing client)', {
            userId: newUserId,
            email,
            clientId: existingClientId,
          });

          return done(null, newUser);
        }

        // CHECK 2: Create new client only if email is unique
        // Initialize default settings for new OAuth client
        const defaultSettings = {
          shopify: { store: '', apiKey: '', apiSecret: '' },
          exotel: { number: '', sid: '', token: '' },
          business: { returnWindowDays: 14, refundAutoThreshold: 2000, cancelWindowHours: 24, escalationThreshold: 60 },
          channels: { whatsApp: false, sms: true, email: true },
          localization: { timezone: 'Asia/Kolkata', language: 'hi' }
        };
        
        const clientResult = await db.query(
          `INSERT INTO clients (id, name, email, active, settings, created_at)
           VALUES ($1, $2, $3, true, $4, NOW())
           RETURNING id`,
          [newClientId, `${name}'s Company`, email, JSON.stringify(defaultSettings)]
        );

        // CREATE: New user with OAuth credentials (no password_hash needed)
        const newUserResult = await db.query(
          `INSERT INTO users 
           (id, client_id, email, name, google_id, google_refresh_token, password_hash, is_active, is_verified, role, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, true, true, 'admin', NOW())
           RETURNING *`,
          [newUserId, newClientId, email, name, googleId, refreshToken]
        );

        const newUser = newUserResult.rows[0];

        logger.info('✅ New user created via Google OAuth', {
          userId: newUserId,
          email,
          clientId: newClientId,
        });

        return done(null, newUser);
      } catch (error) {
        logger.error('❌ Google OAuth strategy error', {
          error: error.message,
          stack: error.stack,
        });
        return done(error);
      }
    }
  )
);

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, client_id, role, is_active, is_verified FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return done(null, false);
    }

    done(null, result.rows[0]);
  } catch (error) {
    logger.error('❌ Deserialize user error', { error: error.message });
    done(error);
  }
});

module.exports = passport;
