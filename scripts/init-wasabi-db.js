#!/usr/bin/env node
// Backend/scripts/init-wasabi-db.js - Initialize Wasabi recording schema
const db = require('../db/postgres');
const logger = require('../utils/logger');

async function initWasabiSchema() {
  try {
    logger.info('🔧 Initializing Wasabi recording schema...');

    // Add recording_url column if it doesn't exist
    await db.query(`
      ALTER TABLE calls 
      ADD COLUMN IF NOT EXISTS recording_url TEXT DEFAULT NULL;
    `);
    logger.info('✅ Added recording_url column to calls table');

    // Add call_charges table for billing tracking
    await db.query(`
      CREATE TABLE IF NOT EXISTS call_charges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        duration_seconds INTEGER NOT NULL,
        rate_per_minute DECIMAL(10, 2) NOT NULL DEFAULT 30,
        total_amount DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    logger.info('✅ Created call_charges table');

    // Add indexes for performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_calls_recording_url 
      ON calls(recording_url);
    `);
    logger.info('✅ Added index on recording_url');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_call_charges_client_id 
      ON call_charges(client_id);
    `);
    logger.info('✅ Added index on call_charges client_id');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_call_charges_created_at 
      ON call_charges(created_at);
    `);
    logger.info('✅ Added index on call_charges created_at');

    // Verify Wasabi environment variables
    const wasabiVars = {
      'WASABI_ENABLED': process.env.WASABI_ENABLED,
      'WASABI_ACCESS_KEY_ID': process.env.WASABI_ACCESS_KEY_ID ? '***' : 'NOT SET',
      'WASABI_SECRET_ACCESS_KEY': process.env.WASABI_SECRET_ACCESS_KEY ? '***' : 'NOT SET',
      'WASABI_BUCKET_NAME': process.env.WASABI_BUCKET_NAME,
      'WASABI_REGION': process.env.WASABI_REGION,
      'WASABI_ENDPOINT': process.env.WASABI_ENDPOINT
    };

    logger.info('📋 Wasabi Configuration:', wasabiVars);

    if (process.env.WASABI_ENABLED !== 'true') {
      logger.warn('⚠️  Wasabi is disabled - call recordings will not be saved');
    } else if (!process.env.WASABI_ACCESS_KEY_ID || !process.env.WASABI_SECRET_ACCESS_KEY) {
      logger.error('❌ Wasabi credentials missing - recordings will fail');
    } else {
      logger.info('✅ Wasabi is properly configured');
    }

    logger.info('✅ Wasabi schema initialization complete!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Failed to initialize Wasabi schema', { error: error.message });
    process.exit(1);
  }
}

initWasabiSchema();
