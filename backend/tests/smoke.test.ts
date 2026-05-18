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
const axios = require('axios').default;

describe('Backend Smoke Tests', () => {
  let app: ReturnType<typeof createApp>;
  let harness: ReturnType<typeof createSmokeHarness>;

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockReset();
    axios.get.mockReset();
    harness = createSmokeHarness();
    currentDownloadManager = harness.downloadManager;
    app = createApp();
    setupAppRoutes(app, harness.pool as any);
  });

  test('rejects unauthenticated requests', async () => {
    const response = await request(app)
      .get('/api/tasks/1')
      .expect(401);

    expect(response.body).toMatchObject({
      error: 'Unauthorized',
      message: 'No authentication token provided',
    });
  });

  test('generates Twitch auth URLs with the public callback origin', async () => {
    const response = await request(app)
      .get('/api/auth/twitch/url')
      .expect(200);

    expect(response.body.url).toContain(
      encodeURIComponent('http://localhost:2261/auth/twitch/callback')
    );
  });

  test('creates a task, runs it manually, and returns manager details', async () => {
    const createResponse = await request(app)
      .post('/api/tasks')
      .set(AUTH_HEADERS.user1)
      .send({
        name: 'Smoke Create Task',
        description: 'Created during smoke test',
        task_type: 'combined',
        channel_ids: [10],
        game_ids: [20],
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'medium',
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      name: 'Smoke Create Task',
      task_type: 'combined',
      priority: 'medium',
      status: 'pending',
    });

    const createdTaskId = Number(createResponse.body.id);
    expect(harness.store.getTask(createdTaskId)?.monitoring_status).toBe('pending');

    const runResponse = await request(app)
      .post(`/api/tasks/${createdTaskId}/run`)
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(runResponse.body).toMatchObject({
      id: createdTaskId,
      status: 'running',
      is_active: true,
    });
    expect(currentDownloadManager.executeTask).toHaveBeenCalledWith(createdTaskId);

    const detailsResponse = await request(app)
      .get(`/api/tasks/${createdTaskId}/details`)
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(detailsResponse.body.queueStatus).toMatchObject({
      pending: expect.any(Number),
      downloading: expect.any(Number),
      failed: expect.any(Number),
      completed: expect.any(Number),
    });
    expect(detailsResponse.body.systemResources.cpu.usage).toBe(18);
    expect(detailsResponse.body.metrics.totalDownloads).toBe(1);
  });

  test('activates a task by switching the download manager into activation mode', async () => {
    const response = await request(app)
      .post('/api/tasks/1/activate')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(response.body).toMatchObject({
      id: 1,
      status: 'running',
      is_active: true,
    });
    expect(currentDownloadManager.executeTask).toHaveBeenCalledWith(1, 'activate');
  });

  test('rejects invalid task payloads', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .set(AUTH_HEADERS.user1)
      .send({
        name: 'Broken Task',
        task_type: 'combined',
        channel_ids: [10],
        game_ids: [20],
        schedule_type: 'interval',
        schedule_value: '60',
        priority: 'urgent',
      })
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.arrayContaining(['priority']),
        }),
      ])
    );
  });

  test('queues a user-owned VOD, falls back to saved priority, and stays idempotent on duplicate adds', async () => {
    await request(app)
      .post('/api/downloads/queue/add')
      .set(AUTH_HEADERS.user1)
      .send({ vodId: 101 })
      .expect(200);

    expect(harness.store.getVod(101)).toMatchObject({
      download_status: 'queued',
      download_priority: 'high',
    });

    await request(app)
      .post('/api/downloads/queue/add')
      .set(AUTH_HEADERS.user1)
      .send({ vodId: 101 })
      .expect(200);

    const queueResponse = await request(app)
      .get('/api/queue')
      .query({ status: 'queued,downloading' })
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(queueResponse.body.total).toBe(2);
    expect(queueResponse.body.items.filter((item: any) => item.id === 101)).toHaveLength(1);
  });

  test('manual queue add revives a completed task so queued VODs are eligible for processing', async () => {
    harness.store.setTaskStatusById(2, 'completed', true);

    await request(app)
      .post('/api/downloads/queue/add')
      .set(AUTH_HEADERS.user2)
      .send({ vodId: 201 })
      .expect(200);

    expect(harness.store.getTask(2)).toMatchObject({
      status: 'downloading',
      is_active: true,
      monitoring_status: 'downloading',
    });
    expect(harness.store.getVod(201)).toMatchObject({
      download_status: 'queued',
    });
  });

  test('rejects queue-add for already completed VODs and requires the redownload path', async () => {
    const response = await request(app)
      .post('/api/downloads/queue/add')
      .set(AUTH_HEADERS.user1)
      .send({ vodId: 104 })
      .expect(409);

    expect(response.body).toMatchObject({
      error: 'VOD already downloaded',
      vodId: 104,
    });
    expect(harness.store.getVod(104)?.download_status).toBe('completed');
  });

  test('requeues a completed VOD through the lifecycle redownload endpoint', async () => {
    const response = await request(app)
      .post('/api/lifecycle/vods/104/redownload')
      .set(AUTH_HEADERS.user1)
      .send({})
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      vodId: 104,
      status: 'queued',
    });
    expect(harness.store.getVod(104)).toMatchObject({
      download_status: 'queued',
      download_progress: 0,
      file_size: 0,
      download_path: null,
    });
    expect(harness.store.completedVods.has(104)).toBe(false);
  });

  test('redirects browser-based OAuth callback failures back into the frontend app', async () => {
    axios.post.mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed with status code 403',
      response: {
        status: 403,
        data: {
          message: 'invalid client secret',
          status: 403,
        },
      },
    });

    const response = await request(app)
      .get('/api/auth/twitch/callback')
      .query({ code: 'fake-code', state: 'smoke-state' })
      .expect(302);

    expect(response.headers.location).toContain('http://localhost:2261/auth/callback');
    expect(response.headers.location).toContain('error=invalid_twitch_configuration');
    expect(response.headers.location).toContain(
      'error_description=Twitch+rejected+the+configured+client+secret.'
    );
  });

  test('enforces user isolation for queue reads and download mutations', async () => {
    const queueResponse = await request(app)
      .get('/api/queue')
      .query({ status: 'pending,queued,downloading,paused' })
      .set(AUTH_HEADERS.user2)
      .expect(200);

    expect(queueResponse.body.items).toHaveLength(1);
    expect(queueResponse.body.items[0]).toMatchObject({
      id: 201,
      task_user_id: 2,
    });

    await request(app)
      .post('/api/downloads/queue/add')
      .set(AUTH_HEADERS.user2)
      .send({ vodId: 101 })
      .expect(404);

    await request(app)
      .post('/api/downloads/cancel/105')
      .set(AUTH_HEADERS.user2)
      .expect(404);
  });

  test('lists VODs and queue history across edge-case states without leaking other users data', async () => {
    const vodsResponse = await request(app)
      .get('/api/vods')
      .query({ status: 'pending,queued,downloading,completed,failed,cancelled,paused' })
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(vodsResponse.body.map((vod: any) => vod.id).sort((left: number, right: number) => left - right)).toEqual([
      101, 102, 103, 104, 105, 106, 107,
    ]);
    expect(vodsResponse.body.some((vod: any) => vod.id === 201)).toBe(false);

    const historyResponse = await request(app)
      .get('/api/queue/history')
      .query({ status: 'completed,failed,cancelled' })
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(historyResponse.body.items.map((item: any) => item.id).sort((left: number, right: number) => left - right)).toEqual([
      102, 103, 104, 107,
    ]);

    const statsResponse = await request(app)
      .get('/api/queue/stats')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(statsResponse.body).toMatchObject({
      pending: 1,
      queued: 0,
      downloading: 1,
      completed: 1,
      failed: 2,
    });

    const estimateResponse = await request(app)
      .get('/api/queue/estimate')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(estimateResponse.body).toEqual({
      estimatedMinutes: 5,
      totalItems: 1,
    });
  });

  test('includes cancelled items in default history and deletes a single history item', async () => {
    const historyResponse = await request(app)
      .get('/api/queue/history')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(historyResponse.body.items.map((item: any) => item.id).sort((left: number, right: number) => left - right)).toEqual([
      102, 103, 104, 107,
    ]);

    await request(app)
      .delete('/api/queue/history/107')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(harness.store.getVod(107)).toBeUndefined();
  });

  test('returns task monitoring stats, performance history, and computed alerts', async () => {
    const statsResponse = await request(app)
      .get('/api/tasks/1/stats')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(statsResponse.body).toMatchObject({
      successRate: 14.29,
      errorRate: 28.57,
      storageUsedGB: 0,
      storageLimitGB: 25,
      activeDownloads: 1,
      maxConcurrent: 3,
      totalVods: 7,
      completedVods: 1,
      failedVods: 2,
    });

    const performanceResponse = await request(app)
      .get('/api/tasks/1/performance')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(performanceResponse.body).toEqual([
      expect.objectContaining({
        successRate: 20,
        errorRate: 40,
        downloadSpeed: 2.25,
        vodCount: 5,
      }),
      expect.objectContaining({
        successRate: 20,
        errorRate: 40,
        downloadSpeed: 2.5,
        vodCount: 5,
      }),
    ]);

    const alertsResponse = await request(app)
      .get('/api/tasks/1/alerts')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(alertsResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
          message: '2 VODs have failed for this task.',
        }),
      ])
    );
  });

  test('retries failed VODs and blocks retries after max retries are exhausted', async () => {
    const retryResponse = await request(app)
      .post('/api/queue/102/retry')
      .set(AUTH_HEADERS.user1)
      .send({})
      .expect(200);

    expect(retryResponse.body.vod).toMatchObject({
      id: 102,
      download_status: 'pending',
      retry_count: 2,
      error_message: null,
    });

    await request(app)
      .post('/api/queue/103/retry')
      .set(AUTH_HEADERS.user1)
      .send({})
      .expect(404);
  });

  test('cancels a user-owned download through the direct downloads endpoint', async () => {
    await request(app)
      .post('/api/downloads/cancel/105')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(harness.store.getVod(105)?.download_status).toBe('cancelled');
    expect(harness.store.getTask(1)).toMatchObject({
      status: 'running',
      monitoring_status: 'running',
    });
  });

  test('cancelling the last queued item reconciles the parent task out of downloading', async () => {
    harness.store.setTaskStatusById(2, 'downloading', true);
    harness.store.addToQueue(201, 'normal');

    await request(app)
      .post('/api/downloads/cancel/201')
      .set(AUTH_HEADERS.user2)
      .expect(200);

    expect(harness.store.getVod(201)?.download_status).toBe('cancelled');
    expect(harness.store.getTask(2)).toMatchObject({
      status: 'completed',
      monitoring_status: 'completed',
    });
  });

  test('pauses then resumes queued or active downloads through the manager endpoints', async () => {
    await request(app)
      .post('/api/downloads/queue/add')
      .set(AUTH_HEADERS.user1)
      .send({ vodId: 101, priority: 'normal' })
      .expect(200);

    await request(app)
      .post('/api/downloads/manager/pause')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(harness.store.getVod(101)).toMatchObject({
      download_status: 'paused',
      pause_reason: 'task_paused',
    });
    expect(harness.store.getVod(105)).toMatchObject({
      download_status: 'paused',
      resume_segment_index: 8,
    });
    expect(currentDownloadManager.stopProcessing).toHaveBeenCalled();

    await request(app)
      .post('/api/downloads/manager/resume')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(harness.store.getVod(101)?.download_status).toBe('queued');
    expect(harness.store.getVod(105)?.download_status).toBe('queued');
    expect(harness.store.getVod(106)?.download_status).toBe('queued');
    expect(currentDownloadManager.startProcessing).toHaveBeenCalled();

    const managerStatusResponse = await request(app)
      .get('/api/downloads/manager/status')
      .set(AUTH_HEADERS.user1)
      .expect(200);

    expect(managerStatusResponse.body).toMatchObject({
      active_downloads: 0,
      metrics: expect.objectContaining({
        totalDownloads: 1,
      }),
    });
  });
});
