// backend/scripts/seed-discovery.ts

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'twitch_sync',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function seedDiscoveryData() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Temporarily disable the cleanup trigger
    await client.query('DROP TRIGGER IF EXISTS trigger_cleanup_old_vods ON vods');

    // Create test user first
    const userResult = await client.query(`
      INSERT INTO users (
        email,
        username,
        twitch_id,
        auth_provider,
        role,
        status,
        display_name,
        created_at
      )
      VALUES (
        'test@example.com',
        'testuser',
        '12345',
        'twitch',
        'user',
        'active',
        'Test User',
        NOW()
      )
      ON CONFLICT (twitch_id) DO UPDATE
      SET status = 'active'
      RETURNING id
    `);

    const userId = userResult.rows[0].id;
    console.log('Created user with ID:', userId);

    // Add some test games
    const gamesResult = await client.query(`
      INSERT INTO games (twitch_game_id, name, box_art_url)
      VALUES 
        ('33214', 'Fortnite', 'https://example.com/fortnite.jpg'),
        ('27471', 'Minecraft', 'https://example.com/minecraft.jpg'),
        ('21779', 'League of Legends', 'https://example.com/lol.jpg')
      ON CONFLICT (twitch_game_id) DO UPDATE 
      SET name = EXCLUDED.name
      RETURNING id, twitch_game_id
    `);

    const games = gamesResult.rows;
    console.log('Created games:', games);

    // Add test channels with current games
    const channelsResult = await client.query(`
      INSERT INTO channels (
        twitch_id, 
        username, 
        display_name, 
        profile_image_url, 
        is_active,
        current_game_id
      )
      VALUES 
        ('123', 'pokimane', 'Pokimane', 'https://example.com/poki.jpg', true, $1),
        ('124', 'ninja', 'Ninja', 'https://example.com/ninja.jpg', true, $2),
        ('125', 'shroud', 'shroud', 'https://example.com/shroud.jpg', true, $3)
      ON CONFLICT (twitch_id) DO UPDATE 
      SET current_game_id = EXCLUDED.current_game_id,
          is_active = true
      RETURNING id
    `, [games[0].twitch_game_id, games[1].twitch_game_id, games[2].twitch_game_id]);

    const channels = channelsResult.rows;
    console.log('Created channels:', channels);

    // Add user preferences
    await client.query(`
      INSERT INTO user_preferences (
        user_id,
        notifications,
        discovery_settings
      )
      VALUES (
        $1,
        '{"email": true, "browser": true, "premieres": true}'::jsonb,
        '{"auto_track": true, "min_confidence": 0.7, "min_viewers": 100, "languages": ["en"]}'::jsonb
      )
      ON CONFLICT (user_id) DO UPDATE
      SET discovery_settings = '{"auto_track": true, "min_confidence": 0.7, "min_viewers": 100, "languages": ["en"]}'::jsonb
    `, [userId]);

    // Add discovery preferences
    await client.query(`
      INSERT INTO discovery_preferences (
        user_id,
        min_viewers,
        max_viewers,
        preferred_languages,
        content_rating,
        notify_only,
        schedule_match,
        confidence_threshold
      )
      VALUES (
        $1,
        100,
        50000,
        ARRAY['en'],
        'all',
        false,
        true,
        0.7
      )
      ON CONFLICT (user_id) DO UPDATE 
      SET min_viewers = EXCLUDED.min_viewers,
          max_viewers = EXCLUDED.max_viewers
    `, [userId]);

    // Add VOD history with downloaded_at and no retention_days
    for (const channel of channels) {
      await client.query(`
        WITH series AS (
          SELECT generate_series(1, 5) AS num
        )
        INSERT INTO vods (
          twitch_id,
          channel_id,
          game_id,
          user_id,
          title,
          duration,
          status,
          download_status,
          auto_delete,
          published_at,
          downloaded_at
        )
        SELECT 
          'vod_' || num || '_' || $1,
          $1::integer,
          $2::integer,
          $3::integer,
          'Stream ' || num,
          INTERVAL '3 hours',
          'completed',
          'completed',
          false,
          NOW() - (INTERVAL '1 day' * num),
          NOW() - (INTERVAL '1 day' * num)
        FROM series
      `, [channel.id, games[Math.floor(Math.random() * games.length)].id, userId]);
    }

    // Add channel metrics
    for (const channel of channels) {
      await client.query(`
        WITH series AS (
          SELECT 
            generate_series(1, 24) as num,
            floor(random() * 5000 + 1000) as base_viewers,
            floor(random() * 1000 + 200) as base_chatters,
            floor(random() * 50000 + 10000) as base_followers,
            floor(random() * 100 + 50) as growth
        )
        INSERT INTO channel_metrics (
          channel_id,
          viewer_count,
          chatter_count,
          follower_count,
          viewer_growth_rate,
          engagement_rate,
          recorded_at
        )
        SELECT
          $1::integer,
          base_viewers + (growth * num),
          base_chatters + (growth * num),
          base_followers + (growth * num),
          0.15 + (random() * 0.1),
          0.4 + (random() * 0.3),
          NOW() - (INTERVAL '1 hour' * num)
        FROM series
      `, [channel.id]);
    }

    // Add premiere events
    await client.query(`
      WITH game_changes AS (
        SELECT 
          c.id as channel_id,
          g.id as game_id,
          generate_series(1, 3) as num
        FROM channels c
        CROSS JOIN games g
        WHERE g.twitch_game_id != c.current_game_id
        LIMIT 5
      )
      INSERT INTO premiere_events (
        channel_id,
        game_id,
        event_type,
        predicted_viewers,
        confidence_score,
        start_time,
        detected_at
      )
      SELECT 
        channel_id,
        game_id,
        'game_change',
        floor(random() * 5000 + 1000),
        random() * 0.4 + 0.6,
        NOW() + (interval '1 hour' * num),
        NOW()
      FROM game_changes
    `);

    // Recreate the cleanup trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_old_vods()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
          RETURN NULL;
        END IF;
        
        UPDATE vods
        SET status = 'archived',
            deletion_scheduled_at = CURRENT_TIMESTAMP + (retention_days || ' days')::interval
        WHERE status = 'completed'
        AND auto_delete = true
        AND downloaded_at < CURRENT_TIMESTAMP - (retention_days || ' days')::interval;
        
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trigger_cleanup_old_vods
        AFTER INSERT OR UPDATE OF status ON vods
        FOR EACH STATEMENT
        EXECUTE FUNCTION cleanup_old_vods();
    `);

    await client.query('COMMIT');
    console.log('Successfully seeded discovery test data');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding discovery test data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDiscoveryData().catch(console.error);
