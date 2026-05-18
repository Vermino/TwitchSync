import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

interface SeedResult {
  userId: number;
  username: string;
  twitchId: string;
  seededTaskId: number;
  seededVodId: number;
  channelName: string;
  gameName: string;
  seededTaskName: string;
  seededVodTitle: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const authDir = path.resolve(__dirname, '.auth');
const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:2261';

function readEnvFile(envPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  const raw = fs.readFileSync(envPath, 'utf8');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

function runSeedSql(dbUser: string, dbName: string): SeedResult {
  const sql = `
    BEGIN;

    INSERT INTO users (
      twitch_id,
      username,
      display_name,
      auth_provider,
      status,
      profile_image_url,
      created_at,
      updated_at
    )
    VALUES (
      'e2e-browser-user',
      'e2e_browser_user',
      'E2E Browser User',
      'twitch',
      'active',
      'https://static-cdn.jtvnw.net/jtv_user_pictures/xarth/404_user_70x70.png',
      NOW(),
      NOW()
    )
    ON CONFLICT (twitch_id) DO UPDATE
    SET
      username = EXCLUDED.username,
      display_name = EXCLUDED.display_name,
      auth_provider = EXCLUDED.auth_provider,
      status = EXCLUDED.status,
      profile_image_url = EXCLUDED.profile_image_url,
      updated_at = NOW();

    DELETE FROM completed_vods
    WHERE task_id IN (
      SELECT id FROM tasks
      WHERE user_id = (SELECT id FROM users WHERE twitch_id = 'e2e-browser-user')
    );

    DELETE FROM vods
    WHERE user_id = (SELECT id FROM users WHERE twitch_id = 'e2e-browser-user')
       OR task_id IN (
         SELECT id FROM tasks
         WHERE user_id = (SELECT id FROM users WHERE twitch_id = 'e2e-browser-user')
       );

    DELETE FROM tasks
    WHERE user_id = (SELECT id FROM users WHERE twitch_id = 'e2e-browser-user');

    INSERT INTO channels (
      twitch_id,
      username,
      display_name,
      profile_image_url,
      description,
      broadcaster_type,
      follower_count,
      view_count,
      language,
      status,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      'e2e-channel-1',
      'e2e_channel',
      'E2E Channel',
      'https://static-cdn.jtvnw.net/jtv_user_pictures/xarth/404_user_70x70.png',
      'Disposable channel for browser E2E coverage',
      'partner',
      4242,
      212121,
      'en',
      'active',
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (twitch_id) DO UPDATE
    SET
      username = EXCLUDED.username,
      display_name = EXCLUDED.display_name,
      profile_image_url = EXCLUDED.profile_image_url,
      description = EXCLUDED.description,
      broadcaster_type = EXCLUDED.broadcaster_type,
      follower_count = EXCLUDED.follower_count,
      view_count = EXCLUDED.view_count,
      language = EXCLUDED.language,
      status = EXCLUDED.status,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();

    INSERT INTO games (
      twitch_game_id,
      name,
      box_art_url,
      category,
      status,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      'e2e-game-1',
      'E2E Game',
      'https://static-cdn.jtvnw.net/ttv-boxart/21779-285x380.jpg',
      'testing',
      'active',
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (twitch_game_id) DO UPDATE
    SET
      name = EXCLUDED.name,
      box_art_url = EXCLUDED.box_art_url,
      category = EXCLUDED.category,
      status = EXCLUDED.status,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();

    WITH seeded_user AS (
      SELECT id, username, twitch_id
      FROM users
      WHERE twitch_id = 'e2e-browser-user'
    ),
    seeded_channel AS (
      SELECT id, display_name
      FROM channels
      WHERE twitch_id = 'e2e-channel-1'
    ),
    seeded_game AS (
      SELECT id, name
      FROM games
      WHERE twitch_game_id = 'e2e-game-1'
    ),
    inserted_task AS (
      INSERT INTO tasks (
        user_id,
        name,
        description,
        task_type,
        channel_ids,
        game_ids,
        schedule_type,
        schedule_value,
        storage_limit_gb,
        retention_days,
        auto_delete,
        is_active,
        priority,
        quality,
        conditions,
        restrictions,
        status,
        created_at,
        updated_at
      )
      SELECT
        seeded_user.id,
        'E2E Seeded Task',
        'Preloaded fixture for browser E2E history checks',
        'combined',
        ARRAY[seeded_channel.id],
        ARRAY[seeded_game.id],
        'manual',
        'manual',
        4,
        14,
        false,
        false,
        'high'::task_priority_level,
        '720p',
        '{"minFollowers":500,"minViews":10,"languages":["en"]}'::jsonb,
        '{"maxTotalVods":5,"maxTotalStorage":12}'::jsonb,
        'completed'::task_status,
        NOW(),
        NOW()
      FROM seeded_user, seeded_channel, seeded_game
      RETURNING id, name
    ),
    inserted_vod AS (
      INSERT INTO vods (
        twitch_id,
        channel_id,
        game_id,
        user_id,
        task_id,
        title,
        description,
        duration,
        content_type,
        status,
        view_count,
        thumbnail_url,
        download_path,
        download_status,
        download_priority,
        download_progress,
        file_size,
        preferred_quality,
        published_at,
        downloaded_at,
        created_at,
        updated_at
      )
      SELECT
        9000000001,
        seeded_channel.id,
        seeded_game.id,
        seeded_user.id,
        inserted_task.id,
        'E2E Seeded VOD',
        'Completed VOD fixture for browser E2E',
        INTERVAL '1 hour 32 minutes',
        'stream'::content_type,
        'completed'::vod_status,
        321,
        'https://static-cdn.jtvnw.net/cf_vods/d2nvs31859zcd8/e2e-thumb-%{width}x%{height}.jpg',
        '/data/vods/e2e-seeded-vod.ts',
        'completed'::vod_status,
        'normal'::download_priority,
        100,
        123456789,
        '720p'::video_quality,
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '1 day',
        NOW(),
        NOW()
      FROM seeded_user, seeded_channel, seeded_game, inserted_task
      RETURNING id, title
    )
    INSERT INTO completed_vods (
      vod_id,
      task_id,
      twitch_id,
      file_path,
      file_name,
      file_size_bytes,
      download_duration_seconds,
      download_speed_mbps,
      completed_at,
      metadata
    )
    SELECT
      inserted_vod.id,
      inserted_task.id,
      9000000001,
      '/data/vods/e2e-seeded-vod.ts',
      'e2e-seeded-vod.ts',
      123456789,
      480,
      18.75,
      NOW() - INTERVAL '1 day',
      '{"quality":"720p","source":"browser-e2e"}'::jsonb
    FROM inserted_vod, inserted_task;

    INSERT INTO vod_file_states (
      vod_id,
      task_id,
      twitch_vod_id,
      file_path,
      file_name,
      file_size_bytes,
      expected_size_bytes,
      file_state,
      download_state,
      verification_status,
      operation_status,
      first_downloaded_at,
      last_verified_at,
      is_user_protected,
      created_at,
      updated_at
    )
    SELECT
      v.id,
      t.id,
      v.twitch_id,
      '/data/vods/e2e-seeded-vod.ts',
      'e2e-seeded-vod.ts',
      123456789,
      123456789,
      'present'::file_state,
      'completed'::vod_status,
      'verified'::verification_status,
      'completed'::operation_status,
      NOW() - INTERVAL '1 day',
      NOW() - INTERVAL '12 hours',
      false,
      NOW(),
      NOW()
    FROM vods v
    JOIN tasks t ON v.task_id = t.id
    WHERE t.user_id = (SELECT id FROM users WHERE twitch_id = 'e2e-browser-user')
      AND t.name = 'E2E Seeded Task'
      AND v.twitch_id = 9000000001
    ON CONFLICT (vod_id) DO UPDATE
    SET
      file_path = EXCLUDED.file_path,
      file_name = EXCLUDED.file_name,
      file_size_bytes = EXCLUDED.file_size_bytes,
      expected_size_bytes = EXCLUDED.expected_size_bytes,
      file_state = EXCLUDED.file_state,
      download_state = EXCLUDED.download_state,
      verification_status = EXCLUDED.verification_status,
      operation_status = EXCLUDED.operation_status,
      first_downloaded_at = EXCLUDED.first_downloaded_at,
      last_verified_at = EXCLUDED.last_verified_at,
      is_user_protected = EXCLUDED.is_user_protected,
      updated_at = NOW();

    INSERT INTO task_performance_metrics (
      task_id,
      execution_time,
      success_rate,
      failure_rate,
      avg_download_speed,
      vod_count,
      storage_used,
      measured_at
    )
    SELECT
      t.id,
      180,
      100,
      0,
      18.75,
      1,
      123456789,
      NOW() - INTERVAL '30 minutes'
    FROM tasks t
    WHERE t.user_id = (SELECT id FROM users WHERE twitch_id = 'e2e-browser-user')
      AND t.name = 'E2E Seeded Task'
    ON CONFLICT (task_id, measured_at) DO NOTHING;

    INSERT INTO task_performance_metrics (
      task_id,
      execution_time,
      success_rate,
      failure_rate,
      avg_download_speed,
      vod_count,
      storage_used,
      measured_at
    )
    SELECT
      t.id,
      120,
      100,
      0,
      19.5,
      1,
      123456789,
      NOW() - INTERVAL '5 minutes'
    FROM tasks t
    WHERE t.user_id = (SELECT id FROM users WHERE twitch_id = 'e2e-browser-user')
      AND t.name = 'E2E Seeded Task'
    ON CONFLICT (task_id, measured_at) DO NOTHING;

    UPDATE task_monitoring
    SET
      status = 'completed',
      status_message = 'Seeded fixture ready for browser E2E',
      progress_percentage = 100,
      items_total = 1,
      items_completed = 1,
      updated_at = NOW()
    WHERE task_id = (
      SELECT id
      FROM tasks
      WHERE user_id = (SELECT id FROM users WHERE twitch_id = 'e2e-browser-user')
        AND name = 'E2E Seeded Task'
    );

    COMMIT;

    SELECT json_build_object(
      'userId', u.id,
      'username', u.username,
      'twitchId', u.twitch_id,
      'seededTaskId', t.id,
      'seededVodId', v.id,
      'channelName', c.display_name,
      'gameName', g.name,
      'seededTaskName', 'E2E Seeded Task',
      'seededVodTitle', 'E2E Seeded VOD'
    )::text
    FROM users u
    CROSS JOIN channels c
    CROSS JOIN games g
    CROSS JOIN tasks t
    CROSS JOIN vods v
    WHERE u.twitch_id = 'e2e-browser-user'
      AND c.twitch_id = 'e2e-channel-1'
      AND g.twitch_game_id = 'e2e-game-1'
      AND t.user_id = u.id
      AND t.name = 'E2E Seeded Task'
      AND v.task_id = t.id
      AND v.twitch_id = 9000000001;
  `;

  const stdout = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-q', '-U', dbUser, '-d', dbName],
    {
      cwd: repoRoot,
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  const lastLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!lastLine) {
    throw new Error('Database seed did not return fixture metadata.');
  }

  return JSON.parse(lastLine) as SeedResult;
}

function createFixtureFile() {
  execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'backend', 'sh', '-lc', "mkdir -p /data/vods && printf 'browser-e2e-fixture\\n' > /data/vods/e2e-seeded-vod.ts"],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
}

async function assertLocalStackHealthy() {
  const response = await fetch(`${baseUrl}/api/health/status`);
  if (!response.ok) {
    throw new Error(`Expected healthy local stack at ${baseUrl}, got ${response.status}.`);
  }
}

export default async function globalSetup() {
  fs.mkdirSync(authDir, { recursive: true });

  await assertLocalStackHealthy();

  const env = readEnvFile(path.join(repoRoot, '.env'));
  const jwtSecret = env.JWT_SECRET;
  const dbUser = env.DB_USER;
  const dbName = env.DB_NAME;

  if (!jwtSecret || !dbUser || !dbName) {
    throw new Error('Missing JWT_SECRET, DB_USER, or DB_NAME in repo .env.');
  }

  const seed = runSeedSql(dbUser, dbName);
  createFixtureFile();
  const token = jwt.sign(
    {
      userId: seed.userId,
      twitchId: seed.twitchId,
      username: seed.username,
    },
    jwtSecret,
    { expiresIn: '7d' }
  );

  fs.writeFileSync(
    path.join(authDir, 'user.json'),
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin: baseUrl,
            localStorage: [
              {
                name: 'auth_token',
                value: token,
              },
            ],
          },
        ],
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(authDir, 'seed-state.json'),
    JSON.stringify(
      {
        baseUrl,
        token,
        user: {
          id: seed.userId,
          username: seed.username,
          twitchId: seed.twitchId,
        },
        fixtures: {
          seededTaskId: seed.seededTaskId,
          seededVodId: seed.seededVodId,
          channelName: seed.channelName,
          gameName: seed.gameName,
          seededTaskName: seed.seededTaskName,
          seededVodTitle: seed.seededVodTitle,
          createdTaskPrefix: 'E2E Browser Task',
        },
      },
      null,
      2
    )
  );
}
