import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { createSettingsHarness } from './helpers/settingsHarness';

process.env.TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'smoke-client-id';
process.env.TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'smoke-client-secret';
process.env.PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:2261';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:2261';
process.env.TWITCH_REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:2261/auth/twitch/callback';

const forceCleanupMock = jest.fn();

jest.mock('../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../src/services/cleanupService', () => ({
  CleanupService: jest.fn().mockImplementation(() => ({
    forceCleanup: forceCleanupMock,
  })),
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate: () => (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;

    if (authHeader === 'Bearer user-1') {
      req.user = { id: '1', twitch_id: 'smoke-user-1' };
      return next();
    }

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No authentication token provided',
    });
  },
}));

const { createApp } = require('../src/config/app');
const { setupSettingsRoutes } = require('../src/routes/settings');
const { authenticate } = require('../src/middleware/auth');

const buildSettingsPayload = (baseDir: string) => ({
  downloads: {
    downloadPath: path.join(baseDir, 'downloads'),
    tempStorageLocation: path.join(baseDir, 'temp'),
    concurrentDownloadLimit: 5,
    bandwidthThrottle: 1200,
    defaultQuality: '720p60',
  },
  fileOrganization: {
    filenameTemplate: '{channel}_{title}_{date}',
    folderStructure: 'by_game',
    createDateBasedFolders: true,
    createChannelFolders: false,
    createGameFolders: true,
    metadataFormat: 'yaml',
  },
  storage: {
    diskSpaceAlertThreshold: 15,
    enableAutoCleanup: true,
    cleanupThresholdGB: 25,
    minAgeForCleanupDays: 45,
    keepMetadataOnCleanup: false,
  },
  notifications: {
    enableEmailNotifications: true,
    emailAddress: 'smoke@example.com',
    enableDesktopNotifications: false,
    enableDiscordWebhook: true,
    discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
    notifyOnDownloadStart: true,
    notifyOnDownloadComplete: false,
    notifyOnError: true,
    notifyOnStorageAlert: false,
  },
});

describe('Settings Smoke Tests', () => {
  let app: ReturnType<typeof createApp>;
  let harness: ReturnType<typeof createSettingsHarness>;
  let previousHostPath: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    forceCleanupMock.mockResolvedValue({
      tempFiles: { deleted: 2, spaceFreed: 15 * 1024 * 1024 },
      logFiles: { deleted: 1, spaceFreed: 5 * 1024 * 1024 },
      database: { oldEvents: 7, orphanedRecords: 3 },
      duration: 1200,
    });
    harness = createSettingsHarness();
    app = createApp();
    app.use('/api/settings', authenticate(harness.pool as any), setupSettingsRoutes(harness.pool as any));
    previousHostPath = process.env.VOD_STORAGE_HOST_PATH;
    process.env.VOD_STORAGE_HOST_PATH = path.join(os.tmpdir(), 'twitchsync-host-storage');
  });

  afterEach(() => {
    if (previousHostPath === undefined) {
      delete process.env.VOD_STORAGE_HOST_PATH;
    } else {
      process.env.VOD_STORAGE_HOST_PATH = previousHostPath;
    }
  });

  test('returns structured default settings', async () => {
    const response = await request(app)
      .get('/api/settings/system')
      .set('Authorization', 'Bearer user-1')
      .expect(200);

    expect(response.body).toMatchObject({
      downloads: expect.objectContaining({
        concurrentDownloadLimit: 3,
        bandwidthThrottle: 0,
        defaultQuality: 'source',
      }),
      fileOrganization: expect.objectContaining({
        folderStructure: 'by_channel',
        metadataFormat: 'json',
      }),
      storage: expect.objectContaining({
        minAgeForCleanupDays: 30,
      }),
      notifications: expect.objectContaining({
        enableDesktopNotifications: true,
        notifyOnDownloadComplete: true,
      }),
    });
  });

  test('round-trips the full settings payload and creates the configured directories', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'twitchsync-settings-roundtrip-'));
    const payload = buildSettingsPayload(baseDir);

    await request(app)
      .post('/api/settings/system')
      .set('Authorization', 'Bearer user-1')
      .send(payload)
      .expect(200);

    expect(harness.store.getState()).toEqual(payload);

    const getResponse = await request(app)
      .get('/api/settings/system')
      .set('Authorization', 'Bearer user-1')
      .expect(200);

    expect(getResponse.body).toEqual(payload);

    await expect(fs.stat(payload.downloads.downloadPath)).resolves.toBeDefined();
    await expect(fs.stat(payload.downloads.tempStorageLocation)).resolves.toBeDefined();
  });

  test.each([
    {
      name: 'rejects invalid concurrent download limits',
      mutate: (payload: ReturnType<typeof buildSettingsPayload>) => {
        payload.downloads.concurrentDownloadLimit = 0;
      },
      expectedError: 'Downloads settings error: Concurrent download limit must be a positive integer',
    },
    {
      name: 'rejects invalid email notification configuration',
      mutate: (payload: ReturnType<typeof buildSettingsPayload>) => {
        payload.notifications.emailAddress = 'not-an-email';
      },
      expectedError: 'Notification settings error: Valid email address is required when email notifications are enabled',
    },
    {
      name: 'rejects invalid Discord webhook configuration',
      mutate: (payload: ReturnType<typeof buildSettingsPayload>) => {
        payload.notifications.discordWebhookUrl = 'https://example.com/not-discord';
      },
      expectedError: 'Notification settings error: Valid Discord webhook URL is required when Discord notifications are enabled',
    },
  ])('$name', async ({ mutate, expectedError }) => {
    const payload = buildSettingsPayload(path.join(os.tmpdir(), 'twitchsync-settings-invalid'));
    mutate(payload);

    const response = await request(app)
      .post('/api/settings/system')
      .set('Authorization', 'Bearer user-1')
      .send(payload)
      .expect(400);

    expect(response.body).toEqual({ error: expectedError });
  });

  test('returns storage stats for the configured download path', async () => {
    const response = await request(app)
      .get('/api/settings/storage')
      .set('Authorization', 'Bearer user-1')
      .expect(200);

    expect(response.body).toEqual({
      totalSpace: expect.any(Number),
      usedSpace: expect.any(Number),
      freeSpace: expect.any(Number),
    });
  });

  test('returns the configured host path for folder selection', async () => {
    const response = await request(app)
      .post('/api/settings/select-folder')
      .set('Authorization', 'Bearer user-1')
      .send({})
      .expect(200);

    expect(response.body).toEqual({
      path: process.env.VOD_STORAGE_HOST_PATH,
    });
  });

  test('lists child directories in sorted order', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'twitchsync-settings-browse-'));
    await fs.mkdir(path.join(rootDir, 'Zulu'));
    await fs.mkdir(path.join(rootDir, 'alpha'));
    await fs.writeFile(path.join(rootDir, 'ignore-me.txt'), 'not-a-directory', 'utf8');

    const response = await request(app)
      .get('/api/settings/browse')
      .query({ path: rootDir })
      .set('Authorization', 'Bearer user-1')
      .expect(200);

    expect(response.body.entries.map((entry: any) => entry.name)).toEqual(['alpha', 'Zulu']);
    expect(response.body.separator).toBe(path.sep);
  });

  test('runs a no-op filesystem rescan cleanly when there are no tracked files', async () => {
    const response = await request(app)
      .post('/api/settings/rescan')
      .set('Authorization', 'Bearer user-1')
      .send({})
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      checked: 0,
      missing: 0,
    });
  });

  test('marks missing tracked files and clears stale completed metadata during rescan', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'twitchsync-settings-rescan-'));
    const trackedPath = path.join(baseDir, 'missing-vod.ts');
    await fs.writeFile(trackedPath, 'seeded content', 'utf8');
    harness.store.seedTrackedVod(501, trackedPath);
    await fs.unlink(trackedPath);

    const response = await request(app)
      .post('/api/settings/rescan')
      .set('Authorization', 'Bearer user-1')
      .send({})
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      checked: 1,
      missing: 1,
    });

    expect(harness.store.getTrackedVod(501)).toEqual({
      tracked: {
        vodId: 501,
        filePath: trackedPath,
        fileState: 'missing',
      },
      completed: null,
      vod: {
        vodId: 501,
        status: 'pending',
        downloadStatus: 'pending',
        downloadProgress: 0,
        downloadPath: null,
        fileSize: null,
        checksum: null,
        errorMessage: null,
      },
    });
  });

  test('normalizes orphaned completed rows even when there are no tracked files left to inspect', async () => {
    harness.store.seedOrphanedCompletedVod(777);

    const response = await request(app)
      .post('/api/settings/rescan')
      .set('Authorization', 'Bearer user-1')
      .send({})
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      checked: 0,
      missing: 0,
    });

    expect(harness.store.getTrackedVod(777)).toEqual({
      tracked: null,
      completed: null,
      vod: {
        vodId: 777,
        status: 'pending',
        downloadStatus: 'pending',
        downloadProgress: 0,
        downloadPath: null,
        fileSize: null,
        checksum: null,
        errorMessage: null,
      },
    });
  });

  test('runs cleanup and returns the expected response shape', async () => {
    const response = await request(app)
      .post('/api/settings/storage/cleanup')
      .set('Authorization', 'Bearer user-1')
      .send({})
      .expect(200);

    expect(forceCleanupMock).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual({
      message: 'Storage cleanup completed',
      stats: {
        tempFilesDeleted: 2,
        logFilesDeleted: 1,
        spaceFreedMB: 20,
        databaseEventsDeleted: 7,
        orphanedRecordsDeleted: 3,
        durationMs: 1200,
      },
    });
  });
});
