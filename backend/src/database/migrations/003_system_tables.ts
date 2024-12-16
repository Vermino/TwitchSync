// backend/src/database/migrations/003_system_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create global settings table
    await client.query(`
      CREATE TABLE system_settings (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        key VARCHAR(100) NOT NULL,
        value JSONB NOT NULL,
        description TEXT,
        is_encrypted BOOLEAN DEFAULT false,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, key)
      );

      CREATE INDEX idx_settings_category ON system_settings(category);
      CREATE INDEX idx_settings_key ON system_settings(key);
    `);

    // User preferences table
    await client.query(`
      CREATE TABLE user_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        notifications JSONB DEFAULT '{
          "email": true,
          "browser": true,
          "discord": false,
          "premieres": true,
          "game_changes": true,
          "channel_live": true,
          "download_complete": true
        }'::jsonb,
        discovery_settings JSONB DEFAULT '{
          "auto_track": false,
          "min_confidence": 0.7,
          "min_viewers": 100,
          "max_viewers": 50000,
          "content_rating": "all",
          "languages": ["en"]
        }'::jsonb,
        theme_settings JSONB DEFAULT '{
          "theme": "system",
          "sidebar": true,
          "animations": true
        }'::jsonb,
        download_settings JSONB DEFAULT '{
          "quality": "best",
          "path_template": "{channel}/{year}/{month}/{title}",
          "auto_delete": false,
          "retention_days": 30,
          "max_concurrent": 3,
          "bandwidth_limit": null
        }'::jsonb,
        streaming_settings JSONB DEFAULT '{
          "preferred_quality": "1080p60",
          "auto_play": true,
          "chat_enabled": true,
          "chat_position": "right",
          "low_latency": true
        }'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_preferences UNIQUE (user_id)
      );
    `);

    // Feature flags table
    await client.query(`
      CREATE TABLE feature_flags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        enabled BOOLEAN DEFAULT false,
        rules JSONB DEFAULT '{}',
        percentage INTEGER DEFAULT 100,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE user_feature_flags (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        feature_id INTEGER REFERENCES feature_flags(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, feature_id)
      );
    `);

    // System stats table
    await client.query(`
      CREATE TABLE system_stats (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        metric VARCHAR(100) NOT NULL,
        value NUMERIC NOT NULL,
        dimensions JSONB DEFAULT '{}',
        measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_stats_category ON system_stats(category);
      CREATE INDEX idx_stats_metric ON system_stats(metric);
      CREATE INDEX idx_stats_measured ON system_stats(measured_at);
    `);

    // Rate limiting table
    await client.query(`
      CREATE TABLE rate_limits (
        id SERIAL PRIMARY KEY,
        key VARCHAR(200) NOT NULL,
        tokens INTEGER NOT NULL,
        last_refill TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(key)
      );

      CREATE INDEX idx_rate_limits_key ON rate_limits(key);
      CREATE INDEX idx_rate_limits_refill ON rate_limits(last_refill);
    `);

    // Add triggers
    await client.query(`
      CREATE TRIGGER update_system_settings_updated_at
        BEFORE UPDATE ON system_settings
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_user_preferences_updated_at
        BEFORE UPDATE ON user_preferences
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_feature_flags_updated_at
        BEFORE UPDATE ON feature_flags
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Insert default system settings
    await client.query(`
      INSERT INTO system_settings (category, key, value, description) VALUES
        ('downloads', 'max_concurrent', '3'::jsonb, 'Maximum concurrent downloads'),
        ('downloads', 'temp_dir', '"/tmp/downloads"'::jsonb, 'Temporary download directory'),
        ('storage', 'retention_days', '30'::jsonb, 'Default content retention period'),
        ('authentication', 'session_duration', '86400'::jsonb, 'Session duration in seconds'),
        ('authentication', 'max_attempts', '5'::jsonb, 'Maximum login attempts before lockout'),
        ('discovery', 'update_interval', '300'::jsonb, 'Discovery update interval in seconds'),
        ('discovery', 'min_confidence', '0.7'::jsonb, 'Minimum confidence score for recommendations'),
        ('monitoring', 'stats_retention', '90'::jsonb, 'Statistics retention period in days');
    `);

    // Insert default feature flags
    await client.query(`
      INSERT INTO feature_flags (name, description, enabled, rules) VALUES
        ('advanced_discovery', 'Enhanced content discovery features', true, '{
          "min_role": "user",
          "requires_verification": true
        }'::jsonb),
        ('beta_ui', 'New beta interface features', false, '{
          "allowed_roles": ["admin", "moderator"],
          "opt_in": true
        }'::jsonb),
        ('ai_recommendations', 'AI-powered content recommendations', false, '{
          "gradual_rollout": true,
          "whitelist_only": true
        }'::jsonb),
        ('chat_integration', 'Twitch chat integration features', true, '{
          "requires_auth": true
        }'::jsonb);
    `);

    // System audit log
    await client.query(`
      CREATE TABLE audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER,
        action VARCHAR(50) NOT NULL,
        previous_state JSONB,
        new_state JSONB,
        metadata JSONB DEFAULT '{}',
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
      CREATE INDEX idx_audit_action ON audit_logs(action);
      CREATE INDEX idx_audit_user ON audit_logs(user_id);
      CREATE INDEX idx_audit_created ON audit_logs(created_at);
    `);

    // Background jobs table
    await client.query(`
      CREATE TYPE job_status AS ENUM (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
      );

      CREATE TYPE job_priority AS ENUM (
        'low', 'normal', 'high', 'critical'
      );

      CREATE TABLE background_jobs (
        id SERIAL PRIMARY KEY,
        job_type VARCHAR(100) NOT NULL,
        status job_status DEFAULT 'pending',
        priority job_priority DEFAULT 'normal',
        payload JSONB NOT NULL,
        result JSONB,
        error_message TEXT,
        retries INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        scheduled_for TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_jobs_status ON background_jobs(status);
      CREATE INDEX idx_jobs_type ON background_jobs(job_type);
      CREATE INDEX idx_jobs_priority ON background_jobs(priority);
      CREATE INDEX idx_jobs_scheduled ON background_jobs(scheduled_for)
        WHERE status = 'pending';
    `);

    // Cache table for system-wide caching
    await client.query(`
      CREATE TABLE cache (
        id SERIAL PRIMARY KEY,
        cache_key VARCHAR(255) NOT NULL,
        value JSONB NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cache_key)
      );

      CREATE INDEX idx_cache_expires ON cache(expires_at);
      CREATE INDEX idx_cache_key ON cache(cache_key);
    `);

    // Webhook configurations
    await client.query(`
      CREATE TABLE webhooks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        url TEXT NOT NULL,
        events TEXT[] NOT NULL,
        secret TEXT,
        is_active BOOLEAN DEFAULT true,
        failure_count INTEGER DEFAULT 0,
        last_failure_message TEXT,
        last_success_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_webhooks_user ON webhooks(user_id);
      CREATE INDEX idx_webhooks_active ON webhooks(is_active) 
        WHERE is_active = true;
    `);

    // Add trigger for background jobs
    await client.query(`
      CREATE TRIGGER update_background_jobs_updated_at
        BEFORE UPDATE ON background_jobs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_webhooks_updated_at
        BEFORE UPDATE ON webhooks
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Create cleanup function for expired cache entries
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_cache()
      RETURNS trigger AS $$
      BEGIN
        DELETE FROM cache WHERE expires_at < CURRENT_TIMESTAMP;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trigger_cleanup_expired_cache
        AFTER INSERT ON cache
        EXECUTE FUNCTION cleanup_expired_cache();
    `);

    await client.query('COMMIT');
    logger.info('System tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('System tables migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop all system-related tables and types
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_cleanup_expired_cache ON cache;
      DROP FUNCTION IF EXISTS cleanup_expired_cache();

      DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
      DROP TRIGGER IF EXISTS update_background_jobs_updated_at ON background_jobs;
      DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON feature_flags;
      DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
      DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;

      DROP TABLE IF EXISTS webhooks;
      DROP TABLE IF EXISTS cache;
      DROP TABLE IF EXISTS background_jobs;
      DROP TABLE IF EXISTS audit_logs;
      DROP TABLE IF EXISTS rate_limits;
      DROP TABLE IF EXISTS system_stats;
      DROP TABLE IF EXISTS user_feature_flags;
      DROP TABLE IF EXISTS feature_flags;
      DROP TABLE IF EXISTS user_preferences;
      DROP TABLE IF EXISTS system_settings;

      DROP TYPE IF EXISTS job_priority;
      DROP TYPE IF EXISTS job_status;
    `);

    await client.query('COMMIT');
    logger.info('System tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('System tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
