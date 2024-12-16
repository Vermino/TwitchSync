// backend/src/database/migrations/006_discovery_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create discovery-related enums
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE trend_direction AS ENUM (
          'rising', 'falling', 'stable'
        );

        CREATE TYPE discovery_event_type AS ENUM (
          'game_change', 'viewer_spike', 'category_change', 
          'milestone_reached', 'recommendation', 'premiere'
        );

        CREATE TYPE recommendation_type AS ENUM (
          'channel', 'game', 'content', 'schedule'
        );

        CREATE TYPE confidence_level AS ENUM (
          'very_low', 'low', 'medium', 'high', 'very_high'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Channel metrics tracking
    await client.query(`
      CREATE TABLE channel_metrics (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        viewer_count INTEGER NOT NULL,
        chatter_count INTEGER,
        follower_count INTEGER,
        subscriber_count INTEGER,
        viewer_growth_rate FLOAT,
        engagement_rate FLOAT,
        chat_activity_rate FLOAT,
        peak_viewers INTEGER,
        average_viewers INTEGER,
        unique_chatters INTEGER,
        stream_uptime INTERVAL,
        bitrate INTEGER,
        quality VARCHAR(20),
        is_mature BOOLEAN,
        language VARCHAR(10),
        game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
        tags TEXT[],
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_metrics_channel ON channel_metrics(channel_id);
      CREATE INDEX idx_metrics_game ON channel_metrics(game_id);
      CREATE INDEX idx_metrics_recorded ON channel_metrics(recorded_at);
    `);

    // Channel metrics aggregation
    await client.query(`
      CREATE TABLE channel_metrics_hourly (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        hour TIMESTAMP NOT NULL,
        avg_viewers FLOAT,
        max_viewers INTEGER,
        min_viewers INTEGER,
        total_chat_messages INTEGER,
        unique_chatters INTEGER,
        new_followers INTEGER,
        new_subscribers INTEGER,
        peak_concurrent INTEGER,
        stream_minutes INTEGER,
        games_played INTEGER[],
        engagement_metrics JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, hour)
      );

      CREATE TABLE channel_metrics_daily (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        avg_viewers FLOAT,
        max_viewers INTEGER,
        total_stream_minutes INTEGER,
        unique_viewers INTEGER,
        new_followers INTEGER,
        lost_followers INTEGER,
        subscriber_count INTEGER,
        subscriber_change INTEGER,
        total_chat_messages INTEGER,
        unique_chatters INTEGER,
        games_played JSONB,
        peak_viewership JSONB,
        engagement_metrics JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, date)
      );
    `);

    // Game metrics tracking
    await client.query(`
      CREATE TABLE game_metrics (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        total_viewers INTEGER,
        peak_viewers INTEGER,
        average_viewers FLOAT,
        active_channels INTEGER,
        top_channels INTEGER[],
        viewer_growth_rate FLOAT,
        trend_direction trend_direction,
        ranking_overall INTEGER,
        ranking_category INTEGER,
        tags TEXT[],
        metadata JSONB,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_game_metrics_game ON game_metrics(game_id);
      CREATE INDEX idx_game_metrics_recorded ON game_metrics(recorded_at);
      CREATE INDEX idx_game_metrics_ranking ON game_metrics(ranking_overall);
    `);

    // Discovery events tracking
    await client.query(`
      CREATE TABLE discovery_events (
        id SERIAL PRIMARY KEY,
        event_type discovery_event_type NOT NULL,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        confidence_level confidence_level NOT NULL,
        priority INTEGER DEFAULT 1,
        metadata JSONB,
        notification_sent BOOLEAN DEFAULT false,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_events_type ON discovery_events(event_type);
      CREATE INDEX idx_events_channel ON discovery_events(channel_id);
      CREATE INDEX idx_events_game ON discovery_events(game_id);
      CREATE INDEX idx_events_expires ON discovery_events(expires_at)
        WHERE expires_at IS NOT NULL;
    `);

    // Content recommendations
    await client.query(`
      CREATE TABLE recommendations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        recommendation_type recommendation_type NOT NULL,
        target_id INTEGER NOT NULL,
        score FLOAT NOT NULL,
        confidence_level confidence_level NOT NULL,
        reasons JSONB NOT NULL,
        metadata JSONB,
        shown_at TIMESTAMP,
        interacted_at TIMESTAMP,
        feedback TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_recommendations_user ON recommendations(user_id);
      CREATE INDEX idx_recommendations_type ON recommendations(recommendation_type);
      CREATE INDEX idx_recommendations_score ON recommendations(score DESC);
      CREATE INDEX idx_recommendations_expires ON recommendations(expires_at)
        WHERE expires_at IS NOT NULL;
    `);

    // Viewer engagement tracking
    await client.query(`
      CREATE TABLE viewer_engagement (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID NOT NULL,
        watch_time INTERVAL,
        chat_messages INTEGER DEFAULT 0,
        bits_used INTEGER DEFAULT 0,
        subscribed BOOLEAN DEFAULT false,
        followed BOOLEAN DEFAULT false,
        raid_participated BOOLEAN DEFAULT false,
        clips_created INTEGER DEFAULT 0,
        starts_at TIMESTAMP NOT NULL,
        ends_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_engagement_channel ON viewer_engagement(channel_id);
      CREATE INDEX idx_engagement_user ON viewer_engagement(user_id);
      CREATE INDEX idx_engagement_session ON viewer_engagement(session_id);
      CREATE INDEX idx_engagement_time ON viewer_engagement(starts_at, ends_at);
    `);

    // Content similarity tracking
    await client.query(`
      CREATE TABLE content_similarity (
        id SERIAL PRIMARY KEY,
        source_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        similarity_type VARCHAR(50) NOT NULL,
        score FLOAT NOT NULL,
        factors JSONB NOT NULL,
        confidence_level confidence_level NOT NULL,
        last_analyzed TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_id, target_id, similarity_type)
      );

      CREATE INDEX idx_similarity_source ON content_similarity(source_id);
      CREATE INDEX idx_similarity_target ON content_similarity(target_id);
      CREATE INDEX idx_similarity_score ON content_similarity(score DESC);
    `);

    // User interests tracking
    await client.query(`
      CREATE TABLE user_interests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        interest_type VARCHAR(50) NOT NULL,
        interest_id INTEGER NOT NULL,
        score FLOAT DEFAULT 0,
        engagement_level INTEGER DEFAULT 0,
        first_interaction TIMESTAMP NOT NULL,
        last_interaction TIMESTAMP NOT NULL,
        interaction_count INTEGER DEFAULT 1,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, interest_type, interest_id)
      );

      CREATE INDEX idx_interests_user ON user_interests(user_id);
      CREATE INDEX idx_interests_type ON user_interests(interest_type);
      CREATE INDEX idx_interests_score ON user_interests(score DESC);
    `);

    // Discovery preferences
    await client.query(`
      CREATE TABLE discovery_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT true,
        min_confidence confidence_level DEFAULT 'medium',
        preferred_languages TEXT[] DEFAULT ARRAY['en'],
        excluded_categories TEXT[],
        excluded_tags TEXT[],
        content_filters JSONB DEFAULT '{"mature": false, "violence": false}'::jsonb,
        schedule_preferences JSONB DEFAULT '{
          "preferred_times": [],
          "timezone": "UTC",
          "days_available": ["1","2","3","4","5","6","7"]
        }'::jsonb,
        notification_settings JSONB DEFAULT '{
          "email": true,
          "browser": true,
          "frequency": "daily",
          "types": ["all"]
        }'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      );
    `);

    // Add triggers for timestamp updates
    await client.query(`
      CREATE TRIGGER update_content_similarity_updated_at
        BEFORE UPDATE ON content_similarity
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_user_interests_updated_at
        BEFORE UPDATE ON user_interests
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_discovery_preferences_updated_at
        BEFORE UPDATE ON discovery_preferences
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Create cleanup function for expired events and recommendations
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_discovery_items()
      RETURNS trigger AS $$
      BEGIN
        DELETE FROM discovery_events 
        WHERE expires_at < CURRENT_TIMESTAMP;
        
        DELETE FROM recommendations 
        WHERE expires_at < CURRENT_TIMESTAMP;
        
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trigger_cleanup_expired_discovery
        AFTER INSERT ON discovery_events
        EXECUTE FUNCTION cleanup_expired_discovery_items();
    `);

    await client.query('COMMIT');
    logger.info('Discovery tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Discovery tables migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop all discovery-related tables and functions
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_cleanup_expired_discovery ON discovery_events;
      DROP FUNCTION IF EXISTS cleanup_expired_discovery_items();

      DROP TRIGGER IF EXISTS update_discovery_preferences_updated_at ON discovery_preferences;
      DROP TRIGGER IF EXISTS update_user_interests_updated_at ON user_interests;
      DROP TRIGGER IF EXISTS update_content_similarity_updated_at ON content_similarity;

      DROP TABLE IF EXISTS discovery_preferences;
      DROP TABLE IF EXISTS user_interests;
      DROP TABLE IF EXISTS content_similarity;
      DROP TABLE IF EXISTS viewer_engagement;
      DROP TABLE IF EXISTS recommendations;
      DROP TABLE IF EXISTS discovery_events;
      DROP TABLE IF EXISTS game_metrics;
      DROP TABLE IF EXISTS channel_metrics_daily;
      DROP TABLE IF EXISTS channel_metrics_hourly;
      DROP TABLE IF EXISTS channel_metrics;

      DROP TYPE IF EXISTS confidence_level;
      DROP TYPE IF EXISTS recommendation_type;
      DROP TYPE IF EXISTS discovery_event_type;
      DROP TYPE IF EXISTS trend_direction;
    `);

    await client.query('COMMIT');
    logger.info('Discovery tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Discovery tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
