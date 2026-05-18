import request from 'supertest';
import { AUTH_HEADERS, createSmokeHarness } from './helpers/smokeHarness';

let currentDownloadManager: any;

process.env.TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'smoke-client-id';
process.env.TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'smoke-client-secret';
process.env.PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:2261';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:2261';
process.env.TWITCH_REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:2261/auth/twitch/callback';

jest.mock('axios', () => {
  const createClient = () => ({
    get: jest.fn(),
    post: jest.fn(),
    defaults: {
      headers: {
        common: {},
      },
    },
  });

  const mockAxios = {
    post: jest.fn(),
    get: jest.fn(),
    create: jest.fn(() => createClient()),
    isAxiosError: (error: any) => Boolean(error?.isAxiosError),
  };

  return {
    __esModule: true,
    default: mockAxios,
    ...mockAxios,
  };
});

jest.mock('../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate: () => (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;

    if (authHeader === 'Bearer user-1') {
      req.user = { id: '1', twitch_id: 'smoke-user-1' };
      return next();
    }

    if (authHeader === 'Bearer user-2') {
      req.user = { id: '2', twitch_id: 'smoke-user-2' };
      return next();
    }

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No authentication token provided',
    });
  },
}));

jest.mock('../src/services/downloadManager', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => currentDownloadManager),
  },
}));

jest.mock('../src/services/downloadManager/index', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => currentDownloadManager),
  },
}));

const { createApp } = require('../src/config/app');
const { setupAppRoutes } = require('../src/config/routes');

describe('Task Options Smoke Tests', () => {
  let app: ReturnType<typeof createApp>;
  let harness: ReturnType<typeof createSmokeHarness>;

  beforeEach(() => {
    jest.clearAllMocks();
    harness = createSmokeHarness();
    currentDownloadManager = harness.downloadManager;
    app = createApp();
    setupAppRoutes(app, harness.pool as any);
  });

  test.each([
    {
      name: 'channel task with manual schedule and nested filters',
      payload: {
        name: 'Channel Manual Task',
        description: 'Manual channel smoke',
        task_type: 'channel',
        channel_ids: [10],
        schedule_type: 'manual',
        schedule_value: 'manual',
        storage_limit_gb: 40,
        retention_days: 14,
        auto_delete: true,
        is_active: true,
        priority: 'low',
        quality: 'source',
        conditions: {
          minFollowers: 2500,
          minViews: 1000,
          languages: ['en', 'fr'],
          requireChat: true,
        },
        restrictions: {
          maxVodsPerChannel: 8,
          maxStoragePerChannel: 120,
        },
      },
    },
    {
      name: 'game task with interval schedule and high quality',
      payload: {
        name: 'Game Interval Task',
        description: 'Interval game smoke',
        task_type: 'game',
        game_ids: [20],
        schedule_type: 'interval',
        schedule_value: '900',
        storage_limit_gb: 15,
        retention_days: 90,
        auto_delete: false,
        is_active: false,
        priority: 'high',
        quality: '1080p60',
        conditions: {
          minDuration: 60,
        },
        restrictions: {
          maxTotalVods: 25,
        },
      },
    },
    {
      name: 'combined task with cron schedule and compact quality',
      payload: {
        name: 'Combined Cron Task',
        description: 'Cron combined smoke',
        task_type: 'combined',
        channel_ids: [10],
        game_ids: [20],
        schedule_type: 'cron',
        schedule_value: '*/30 * * * *',
        storage_limit_gb: 60,
        retention_days: 365,
        auto_delete: false,
        is_active: true,
        priority: 'medium',
        quality: '160p',
        conditions: {
          minFollowers: 0,
          minViews: 0,
        },
        restrictions: {
          maxTotalStorage: 500,
          maxStoragePerChannel: 200,
        },
      },
    },
  ])('creates and persists $name', async ({ payload }) => {
    const response = await request(app)
      .post('/api/tasks')
      .set(AUTH_HEADERS.user1)
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      name: payload.name,
      description: payload.description,
      task_type: payload.task_type,
      schedule_type: payload.schedule_type,
      schedule_value: payload.schedule_value,
      storage_limit_gb: payload.storage_limit_gb,
      retention_days: payload.retention_days,
      auto_delete: payload.auto_delete,
      is_active: payload.is_active,
      priority: payload.priority,
      quality: payload.quality,
      conditions: payload.conditions,
      restrictions: payload.restrictions,
    });

    const storedTask = harness.store.getTask(Number(response.body.id));
    expect(storedTask).toMatchObject({
      name: payload.name,
      task_type: payload.task_type,
      channel_ids: payload.channel_ids ?? [],
      game_ids: payload.game_ids ?? [],
      schedule_type: payload.schedule_type,
      schedule_value: payload.schedule_value,
      priority: payload.priority,
      quality: payload.quality,
      conditions: payload.conditions ?? {},
      restrictions: payload.restrictions ?? {},
    });
  });

  test('defaults optional task priority to low when omitted', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .set(AUTH_HEADERS.user1)
      .send({
        name: 'Default Priority Task',
        task_type: 'channel',
        channel_ids: [10],
        schedule_type: 'manual',
        schedule_value: 'manual',
      })
      .expect(201);

    expect(response.body.priority).toBe('low');
    expect(harness.store.getTask(Number(response.body.id))?.priority).toBe('low');
  });

  test.each([
    {
      name: 'rejects interval schedules below five minutes',
      payload: {
        name: 'Too Fast Task',
        task_type: 'channel',
        channel_ids: [10],
        schedule_type: 'interval',
        schedule_value: '60',
      },
      expectedPath: 'schedule_value',
    },
    {
      name: 'rejects unsupported video quality values',
      payload: {
        name: 'Bad Quality Task',
        task_type: 'channel',
        channel_ids: [10],
        schedule_type: 'manual',
        schedule_value: 'manual',
        quality: '4k',
      },
      expectedPath: 'quality',
    },
    {
      name: 'rejects retention periods above the supported max',
      payload: {
        name: 'Bad Retention Task',
        task_type: 'channel',
        channel_ids: [10],
        schedule_type: 'manual',
        schedule_value: 'manual',
        retention_days: 366,
      },
      expectedPath: 'retention_days',
    },
    {
      name: 'rejects negative condition thresholds',
      payload: {
        name: 'Bad Conditions Task',
        task_type: 'channel',
        channel_ids: [10],
        schedule_type: 'manual',
        schedule_value: 'manual',
        conditions: {
          minFollowers: -1,
        },
      },
      expectedPath: 'conditions',
    },
    {
      name: 'rejects negative restriction ceilings',
      payload: {
        name: 'Bad Restrictions Task',
        task_type: 'channel',
        channel_ids: [10],
        schedule_type: 'manual',
        schedule_value: 'manual',
        restrictions: {
          maxTotalVods: -3,
        },
      },
      expectedPath: 'restrictions',
    },
  ])('$name', async ({ payload, expectedPath }) => {
    const response = await request(app)
      .post('/api/tasks')
      .set(AUTH_HEADERS.user1)
      .send(payload)
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.arrayContaining([expectedPath]),
        }),
      ])
    );
  });
});
