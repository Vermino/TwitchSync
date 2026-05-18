import fs from 'fs';
import path from 'path';

type LiveVod = {
  id: number;
  download_status: string;
  download_path?: string | null;
  error_message?: string | null;
};

const shouldRun = process.env.LIVE_DOWNLOAD_SMOKE === '1';
const describeIfEnabled = shouldRun ? describe : describe.skip;

const requiredEnv = [
  'LIVE_SMOKE_BASE_URL',
  'LIVE_SMOKE_AUTH_TOKEN',
  'LIVE_SMOKE_VOD_ID',
];

const pollIntervalMs = Number(process.env.LIVE_SMOKE_POLL_INTERVAL_MS || '5000');
const timeoutMs = Number(process.env.LIVE_SMOKE_TIMEOUT_MS || '300000');

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.LIVE_SMOKE_AUTH_TOKEN}`,
  'Content-Type': 'application/json',
});

const ensureRequiredEnv = () => {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required live smoke env vars: ${missing.join(', ')}`);
  }
};

const apiFetch = async (pathname: string, init?: RequestInit) => {
  const response = await fetch(`${normalizeBaseUrl(process.env.LIVE_SMOKE_BASE_URL!)}/${pathname.replace(/^\/+/, '')}`, {
    ...init,
    headers: {
      ...getHeaders(),
      ...(init?.headers || {}),
    },
  });

  const rawBody = await response.text();
  const body = rawBody ? JSON.parse(rawBody) : null;

  return { response, body };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveCleanupCandidate = (downloadPath: string) => {
  const storageRoot = process.env.LIVE_SMOKE_STORAGE_ROOT;
  if (!storageRoot) {
    return null;
  }

  const resolvedRoot = path.resolve(storageRoot);
  const runtimeStorageRoot = process.env.LIVE_SMOKE_RUNTIME_STORAGE_ROOT;
  const resolvedFile = runtimeStorageRoot && downloadPath.startsWith(`${runtimeStorageRoot}/`)
    ? path.join(resolvedRoot, path.basename(downloadPath))
    : path.resolve(downloadPath);

  if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`) && resolvedFile !== resolvedRoot) {
    throw new Error(`Refusing cleanup outside LIVE_SMOKE_STORAGE_ROOT: ${resolvedFile}`);
  }

  return resolvedFile;
};

describeIfEnabled('Live download smoke', () => {
  jest.setTimeout(timeoutMs + 30_000);

  beforeAll(() => {
    ensureRequiredEnv();
  });

  test('queues a real VOD download and waits for a terminal state', async () => {
    const vodId = Number(process.env.LIVE_SMOKE_VOD_ID);

    const queueResponse = await apiFetch('/api/downloads/queue/add', {
      method: 'POST',
      body: JSON.stringify({ vodId }),
    });

    expect(queueResponse.response.status).toBe(200);

    const startedAt = Date.now();
    let finalVod: LiveVod | undefined;

    while (Date.now() - startedAt < timeoutMs) {
      const vodsResponse = await apiFetch('/api/vods?status=queued,downloading,completed,failed,cancelled,paused');
      expect(vodsResponse.response.status).toBe(200);

      finalVod = (vodsResponse.body as LiveVod[]).find((vod) => Number(vod.id) === vodId);
      if (finalVod && ['completed', 'failed', 'cancelled'].includes(finalVod.download_status)) {
        break;
      }

      await sleep(pollIntervalMs);
    }

    expect(finalVod).toBeDefined();
    expect(finalVod?.download_status).toBe('completed');

    if (finalVod?.download_path) {
      expect(fs.existsSync(finalVod.download_path)).toBe(true);
    }

    if (process.env.LIVE_SMOKE_CLEANUP === '1' && finalVod?.download_path) {
      const cleanupPath = resolveCleanupCandidate(finalVod.download_path);
      if (cleanupPath && fs.existsSync(cleanupPath)) {
        fs.rmSync(cleanupPath, { force: true });
      }

      const deleteResponse = await apiFetch(`/api/vods/${vodId}`, {
        method: 'DELETE',
      });
      expect(deleteResponse.response.status).toBe(200);
    }
  });
});
