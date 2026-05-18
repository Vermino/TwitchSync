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

    // Add games from CSV data
    const gamesResult = await client.query(`
      INSERT INTO games (id, twitch_game_id, name, box_art_url)
      VALUES 
        (17, 10564, 'FINAL FANTASY XII', 'https://static-cdn.jtvnw.net/ttv-boxart/10564_IGDB-285x380.jpg'),
        (19, 11818, 'Tactics Ogre: The Knight of Lodis', 'https://static-cdn.jtvnw.net/ttv-boxart/11818_IGDB-285x380.jpg'),
        (15, 11988, 'FINAL FANTASY VII', 'https://static-cdn.jtvnw.net/ttv-boxart/11988_IGDB-285x380.jpg'),
        (13, 1519193002, 'Slice & Dice', 'https://static-cdn.jtvnw.net/ttv-boxart/1519193002_IGDB-285x380.jpg'),
        (18, 15531, 'Tactics Ogre: Let Us Cling Together', 'https://static-cdn.jtvnw.net/ttv-boxart/15531_IGDB-285x380.jpg'),
        (21, 18181, 'FINAL FANTASY TACTICS', 'https://static-cdn.jtvnw.net/ttv-boxart/18181_IGDB-285x380.jpg'),
        (2, 20596, 'Dofus', 'https://static-cdn.jtvnw.net/ttv-boxart/20596_IGDB-285x380.jpg'),
        (22, 2066834255, 'Tactics Ogre: Reborn', 'https://static-cdn.jtvnw.net/ttv-boxart/2066834255_IGDB-285x380.jpg'),
        (23, 21136, 'Wakfu', 'https://static-cdn.jtvnw.net/ttv-boxart/21136_IGDB-285x380.jpg'),
        (5, 263489, 'Risk of Rain', 'https://static-cdn.jtvnw.net/ttv-boxart/263489_IGDB-285x380.jpg'),
        (20, 270138946, 'Tactics Ogre: Let Us Cling Together', 'https://static-cdn.jtvnw.net/ttv-boxart/270138946_IGDB-285x380.jpg'),
        (7, 31339, 'Project Zomboid', 'https://static-cdn.jtvnw.net/ttv-boxart/31339_IGDB-285x380.jpg'),
        (1, 33882, 'FTL: Faster Than Light', 'https://static-cdn.jtvnw.net/ttv-boxart/33882_IGDB-285x380.jpg'),
        (14, 394568, 'RimWorld', 'https://static-cdn.jtvnw.net/ttv-boxart/394568-285x380.jpg'),
        (8, 490771, 'Battle Brothers', 'https://static-cdn.jtvnw.net/ttv-boxart/490771_IGDB-285x380.jpg'),
        (16, 493926, 'Final Fantasy XII: The Zodiac Age', 'https://static-cdn.jtvnw.net/ttv-boxart/493926_IGDB-285x380.jpg'),
        (9, 496902, 'Slay the Spire', 'https://static-cdn.jtvnw.net/ttv-boxart/496902_IGDB-285x380.jpg'),
        (10, 505, 'Asheron''s Call', 'https://static-cdn.jtvnw.net/ttv-boxart/505_IGDB-285x380.jpg'),
        (3, 505045, 'DOFUS Touch', 'https://static-cdn.jtvnw.net/ttv-boxart/505045_IGDB-285x380.jpg'),
        (6, 505980, 'Stoneshard', 'https://static-cdn.jtvnw.net/ttv-boxart/505980_IGDB-285x380.jpg'),
        (4, 509110, 'Risk of Rain 2', 'https://static-cdn.jtvnw.net/ttv-boxart/509110_IGDB-285x380.jpg'),
        (11, 515865, 'Songs of Syx', 'https://static-cdn.jtvnw.net/ttv-boxart/515865_IGDB-285x380.jpg'),
        (12, 9954, 'EverQuest', 'https://static-cdn.jtvnw.net/ttv-boxart/9954_IGDB-285x380.jpg')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          box_art_url = EXCLUDED.box_art_url
      RETURNING id, twitch_game_id
    `);

    const games = gamesResult.rows;
    console.log('Created games:', games);

    // Add channels from CSV data
    const channelsResult = await client.query(`
      INSERT INTO channels (
        id,
        twitch_id,
        username,
        display_name,
        profile_image_url,
        is_active       
      )
      VALUES
        (1, 23460970, 'lethalfrag', 'Lethalfrag', 'https://static-cdn.jtvnw.net/jtv_user_pictures/75fb6e9c-9862-4d77-9a2e-75535b3b46f0-profile_image-300x300.png', true),
        (2, 18731326, 'celerity', 'Celerity', 'https://static-cdn.jtvnw.net/jtv_user_pictures/44ec13df-92b6-4cba-9699-a9151ecda2e0-profile_image-300x300.png', true),  
        (3, 56625428, 'silentsentry', 'SilentSentry', 'https://static-cdn.jtvnw.net/jtv_user_pictures/silentsentry-profile_image-7520c0ac773d86c2-300x300.png', true),
        (4, 23946146, 'dolphinchemist', 'DolphinChemist', 'https://static-cdn.jtvnw.net/jtv_user_pictures/dolphinchemist-profile_image-ecf61830fb690f96-300x300.png', true),
        (5, 46029485, 'disnof', 'Disnof', 'https://static-cdn.jtvnw.net/jtv_user_pictures/disnof-profile_image-8844d523f51cc553-300x300.png', true),
        (6, 41463454, 'arvius', 'Arvius', 'https://static-cdn.jtvnw.net/jtv_user_pictures/e50ae6a7-bd9f-4ffb-a7da-45ab5b741f8c-profile_image-300x300.png', true),
        (7, 37760929, 'akdylie', 'AKDylie', 'https://static-cdn.jtvnw.net/jtv_user_pictures/e2fe0015-877a-44a2-aab2-7706bdeca38f-profile_image-300x300.png', true),
        (8, 37611773, 'rawrquaza', 'Rawrquaza', 'https://static-cdn.jtvnw.net/jtv_user_pictures/rawrquaza-profile_image-cde7c7666226d48e-300x300.png', true),
        (9, 126436297, 'klean', 'Klean', 'https://static-cdn.jtvnw.net/jtv_user_pictures/82dc2397-e289-4e7c-bd59-471e6612a6f3-profile_image-300x300.png', true),
        (10, 30951539, 'soloman', 'soloman', 'https://static-cdn.jtvnw.net/jtv_user_pictures/caedd3c4-986c-42b7-99f6-eba12d5067ac-profile_image-300x300.png', true)
      ON CONFLICT (id) DO UPDATE
      SET username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          profile_image_url = EXCLUDED.profile_image_url,  
          is_active = true
      RETURNING id  
    `);

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
      const gameId = games[Math.floor(Math.random() * games.length)].id;

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
      `, [channel.id, gameId, userId]);
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
