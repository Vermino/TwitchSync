// Filepath: backend/src/database/migrations/003_system_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create function for timestamp updates if it doesn't exist
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create enums first with IF NOT EXISTS checks
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
          CREATE TYPE job_status AS ENUM (
            'pending',
            'processing',
            'completed',
            'failed',
            'cancelled'
          );
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_priority') THEN
          CREATE TYPE job_priority AS ENUM (
            'low',
            'normal',
            'high',
            'critical'
          );
        END IF;
      END $$;
    `);

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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_preferences UNIQUE (user_id)
      );
    `);

    // Tasks tables
    await client.query(`
      CREATE TABLE tasks (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        task_type VARCHAR(50) NOT NULL,
        channel_ids INTEGER[],
        game_ids INTEGER[],
        schedule_type VARCHAR(50) NOT NULL,
        schedule_value TEXT NOT NULL,
        storage_limit_gb INTEGER,
        retention_days INTEGER,
        auto_delete BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 1,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'pending',
        last_run TIMESTAMP WITH TIME ZONE,
        next_run TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_tasks_user ON tasks(user_id);
      CREATE INDEX idx_tasks_status ON tasks(status);
      CREATE INDEX idx_tasks_next_run ON tasks(next_run) WHERE status = 'pending';

      CREATE TABLE task_history (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_task_history_task ON task_history(task_id);
      CREATE INDEX idx_task_history_status ON task_history(status);
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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE user_feature_flags (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        feature_id INTEGER REFERENCES feature_flags(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
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
        measured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_stats_category ON system_stats(category);
      CREATE INDEX idx_stats_metric ON system_stats(metric);
      CREATE INDEX idx_stats_measured ON system_stats(measured_at);
    `);

    // System events table
    await client.query(`
      CREATE TABLE system_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(50) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_events_type ON system_events(type);
      CREATE INDEX idx_events_created ON system_events(created_at);
    `);

    // Rate limiting table
    await client.query(`
      CREATE TABLE rate_limits (
        id SERIAL PRIMARY KEY,
        key VARCHAR(200) NOT NULL,
        tokens INTEGER NOT NULL,
        last_refill TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(key)
      );

      CREATE INDEX idx_rate_limits_key ON rate_limits(key);
      CREATE INDEX idx_rate_limits_refill ON rate_limits(last_refill);
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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
      CREATE INDEX idx_audit_action ON audit_logs(action);
      CREATE INDEX idx_audit_user ON audit_logs(user_id);
      CREATE INDEX idx_audit_created ON audit_logs(created_at);
    `);

    // Background jobs table
    await client.query(`
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
        scheduled_for TIMESTAMP WITH TIME ZONE,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_jobs_status ON background_jobs(status);
      CREATE INDEX idx_jobs_type ON background_jobs(job_type);
      CREATE INDEX idx_jobs_priority ON background_jobs(priority);
      CREATE INDEX idx_jobs_scheduled ON background_jobs(scheduled_for)
        WHERE status = 'pending';
    `);

    // Add triggers for timestamp updates
    await client.query(`
      CREATE TRIGGER update_system_settings_updated_at
        BEFORE UPDATE ON system_settings
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_user_preferences_updated_at
        BEFORE UPDATE ON user_preferences
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_tasks_updated_at
        BEFORE UPDATE ON tasks
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_feature_flags_updated_at
        BEFORE UPDATE ON feature_flags
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_background_jobs_updated_at
        BEFORE UPDATE ON background_jobs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_system_events_updated_at
        BEFORE UPDATE ON system_events
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

    // Drop triggers first
    await client.query(`
      DROP TRIGGER IF EXISTS update_background_jobs_updated_at ON background_jobs;
      DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON feature_flags;
      DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
      DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
      DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
      DROP TRIGGER IF EXISTS update_system_events_updated_at ON system_events;
    `);

    // Drop tables in correct order
    await client.query(`
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TABLE IF EXISTS rate_limits CASCADE;
      DROP TABLE IF EXISTS system_stats CASCADE;
      DROP TABLE IF EXISTS system_events CASCADE;
      DROP TABLE IF EXISTS user_feature_flags CASCADE;
      DROP TABLE IF EXISTS feature_flags CASCADE;
      DROP TABLE IF EXISTS task_history CASCADE;
      DROP TABLE IF EXISTS tasks CASCADE;
      DROP TABLE IF EXISTS background_jobs CASCADE;
      DROP TABLE IF EXISTS user_preferences CASCADE;
      DROP TABLE IF EXISTS system_settings CASCADE;
    `);

    // Drop enums last
    await client.query(`
      DROP TYPE IF EXISTS job_status CASCADE;
      DROP TYPE IF EXISTS job_priority CASCADE;
    `);

    // Drop the update timestamp function
    await client.query(`
      DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
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
