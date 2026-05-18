export {};

const mkdirMock = jest.fn();
const statMock = jest.fn();
const fileSystemConstructorMock = jest.fn();
const createTempDirectoryMock = jest.fn();
const cleanupDirectoryMock = jest.fn();
const isVodCompletedMock = jest.fn();
const getTaskCompletionStatsMock = jest.fn();
const emitDownloadStatusChangeMock = jest.fn();
const emitDownloadProgressMock = jest.fn();
const twitchServiceMock = {
  getVODInfo: jest.fn(),
  getVODPlaylist: jest.fn(),
};

jest.mock('fs', () => ({
  promises: {
    mkdir: mkdirMock,
    stat: statMock,
  },
  createWriteStream: jest.fn(),
  createReadStream: jest.fn(),
  existsSync: jest.fn(() => false),
}));

jest.mock('../src/services/downloadManager/utils/fileSystem', () => ({
  FileSystemManager: jest.fn().mockImplementation((tempDir: string) => {
    fileSystemConstructorMock(tempDir);
    return {
      createTempDirectory: createTempDirectoryMock,
      cleanupDirectory: cleanupDirectoryMock,
    };
  }),
}));

jest.mock('../src/services/twitch/service', () => ({
  TwitchService: {
    getInstance: jest.fn(() => twitchServiceMock),
  },
}));

jest.mock('../src/services/completedVodService', () => ({
  CompletedVodService: jest.fn().mockImplementation(() => ({
    isVodCompleted: isVodCompletedMock,
    getTaskCompletionStats: getTaskCompletionStatsMock,
  })),
}));

jest.mock('../src/services/websocketService', () => ({
  WebSocketService: {
    getInstance: jest.fn(() => ({
      emitDownloadStatusChange: emitDownloadStatusChangeMock,
      emitDownloadProgress: emitDownloadProgressMock,
    })),
  },
}));

type QueryResult = {
  rows: any[];
  rowCount: number;
};

class DownloadConfigClient {
  async query(queryText: string): Promise<QueryResult> {
    const sql = queryText.replace(/\s+/g, ' ').trim().toLowerCase();

    if (
      sql.includes('select')
      && sql.includes("max(case when key = 'download_path'")
      && sql.includes('from system_settings')
      && sql.includes("where category = 'downloads'")
    ) {
      return {
        rows: [{
          download_path: 'C:\\Users\\jesse\\TwitchSync\\Downloads',
          temp_dir: '/tmp/twitchsync-custom',
          concurrent_limit: 3,
        }],
        rowCount: 1,
      };
    }

    if (
      sql.includes('select count(*) as count')
      && sql.includes('from vods')
      && sql.includes("where download_status = 'downloading'")
    ) {
      return {
        rows: [{ count: 0 }],
        rowCount: 1,
      };
    }

    if (
      sql.startsWith('update vods set status = \'downloading\'')
      || sql.startsWith('update task_monitoring set status = \'running\'')
    ) {
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unhandled download config query: ${sql}`);
  }

  release() {}
}

class DownloadConfigPool {
  async connect() {
    return new DownloadConfigClient();
  }
}

type CompletedFastPathState = {
  vodUpdateParams: any[] | null;
  taskUpdateParams: any[] | null;
  monitoringUpdateParams: any[] | null;
};

class CompletedFastPathClient {
  constructor(private readonly state: CompletedFastPathState) {}

  async query(queryText: string, params: any[] = []): Promise<QueryResult> {
    const sql = queryText.replace(/\s+/g, ' ').trim().toLowerCase();

    if (sql.startsWith('update vods set status = \'completed\'')) {
      this.state.vodUpdateParams = params;
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes('select')
      && sql.includes('count(*)::int as total_vods')
      && sql.includes('count(*) filter (where download_status in (\'queued\', \'downloading\'))::int as active_vods')
      && sql.includes('where task_id = $1')
    ) {
      return {
        rows: [{
          total_vods: 1,
          active_vods: 0,
          waiting_vods: 0,
          completed_vods: 1,
          failed_vods: 0,
          cancelled_vods: 0,
        }],
        rowCount: 1,
      };
    }

    if (sql.startsWith('update tasks set status = $2::task_status')) {
      this.state.taskUpdateParams = params;
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('update task_monitoring set status = $2,')) {
      this.state.monitoringUpdateParams = params;
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unhandled completed fast-path query: ${sql}`);
  }

  release() {}
}

class CompletedFastPathPool {
  constructor(private readonly state: CompletedFastPathState) {}

  async connect() {
    return new CompletedFastPathClient(this.state);
  }
}

type CompletionTrackingState = {
  completionMonitoringParams: any[] | null;
};

class CompletionTrackingClient {
  constructor(private readonly state: CompletionTrackingState) {}

  async query(queryText: string, params: any[] = []): Promise<QueryResult> {
    const sql = queryText.replace(/\s+/g, ' ').trim().toLowerCase();

    if (
      sql.includes('select')
      && sql.includes("max(case when key = 'download_path'")
      && sql.includes('from system_settings')
      && sql.includes("where category = 'downloads'")
    ) {
      return {
        rows: [{
          download_path: '/data/vods',
          temp_dir: '/tmp/twitchsync-custom',
          concurrent_limit: 3,
        }],
        rowCount: 1,
      };
    }

    if (
      sql.includes('select count(*) as count')
      && sql.includes('from vods')
      && sql.includes("where download_status = 'downloading'")
    ) {
      return {
        rows: [{ count: 0 }],
        rowCount: 1,
      };
    }

    if (
      sql.startsWith('update vods set status = \'downloading\'')
      || sql.startsWith('update task_monitoring set status = \'running\'')
      || sql.startsWith('update vods set status = \'completed\'')
      || sql.includes('select upsert_completed_vod(')
      || sql.includes('select safe_release_vod_lock(')
      || sql.startsWith('insert into vod_file_states (')
    ) {
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.startsWith('update task_monitoring set status = case')
      && sql.includes('progress_percentage = $4::int')
      && sql.includes('items_completed = $2::int')
      && sql.includes('items_total = $3::int')
    ) {
      this.state.completionMonitoringParams = params;
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.startsWith('select id from vods')
      && sql.includes("where download_status = 'queued'")
    ) {
      return { rows: [], rowCount: 0 };
    }

    throw new Error(`Unhandled completion tracking query: ${sql}`);
  }

  release() {}
}

class CompletionTrackingPool {
  constructor(private readonly state: CompletionTrackingState) {}

  async connect() {
    return new CompletionTrackingClient(this.state);
  }
}

describe('DownloadHandler configuration usage', () => {
  const originalDownloadPath = process.env.DOWNLOAD_PATH;
  const originalStoragePath = process.env.STORAGE_PATH;
  const originalHostPath = process.env.VOD_STORAGE_HOST_PATH;
  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
    createTempDirectoryMock.mockRejectedValue(new Error('temp-dir-sentinel'));
    cleanupDirectoryMock.mockResolvedValue(undefined);
    statMock.mockReset();
    twitchServiceMock.getVODInfo.mockReset();
    twitchServiceMock.getVODPlaylist.mockReset();
    isVodCompletedMock.mockResolvedValue(false);
    getTaskCompletionStatsMock.mockResolvedValue({
      completed_vods: 0,
      total_vods: 1,
      completion_percentage: 0,
    });
    process.env.DOWNLOAD_PATH = '/data/vods';
    process.env.STORAGE_PATH = '/data/vods';
    process.env.VOD_STORAGE_HOST_PATH = 'C:/Users/jesse/TwitchSync/Downloads';
    Object.defineProperty(process, 'platform', { value: 'linux' });
  });

  afterAll(() => {
    process.env.DOWNLOAD_PATH = originalDownloadPath;
    process.env.STORAGE_PATH = originalStoragePath;
    process.env.VOD_STORAGE_HOST_PATH = originalHostPath;
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('uses the resolved runtime download path and the configured temp directory from settings', async () => {
    const { DownloadHandler } = require('../src/services/downloadManager/handlers/downloadHandler');
    const handler = new DownloadHandler(new DownloadConfigPool() as any, '/tmp/base-handler-temp', 3);

    await expect(handler.processVOD({
      id: 401,
      twitch_id: '9001',
      task_id: 7,
    })).rejects.toThrow('temp-dir-sentinel');

    expect(mkdirMock).toHaveBeenCalledWith('/data/vods', { recursive: true });
    expect(fileSystemConstructorMock.mock.calls.map((call) => call[0])).toEqual([
      '/tmp/base-handler-temp',
      '/tmp/twitchsync-custom',
    ]);
    expect(createTempDirectoryMock).toHaveBeenCalledWith('9001');
  });

  test('reconciles a queued VOD back to completed when a completed artifact already exists', async () => {
    const state: CompletedFastPathState = {
      vodUpdateParams: null,
      taskUpdateParams: null,
      monitoringUpdateParams: null,
    };

    isVodCompletedMock.mockResolvedValue(true);

    const { DownloadHandler } = require('../src/services/downloadManager/handlers/downloadHandler');
    const handler = new DownloadHandler(new CompletedFastPathPool(state) as any, '/tmp/base-handler-temp', 3);

    await expect(handler.processVOD({
      id: 402,
      twitch_id: '9002',
      task_id: 8,
    })).resolves.toBeUndefined();

    expect(state.vodUpdateParams).toEqual([402]);
    expect(state.taskUpdateParams).toEqual([8, 'completed']);
    expect(state.monitoringUpdateParams).toEqual([
      8,
      'completed',
      'Downloads finished: 1/1 completed, 0 failed, 0 cancelled',
      100,
      1,
      1,
      0,
    ]);
    expect(emitDownloadStatusChangeMock).toHaveBeenCalledWith(402, 8, 'completed', 100);
    expect(mkdirMock).not.toHaveBeenCalled();
    expect(createTempDirectoryMock).not.toHaveBeenCalled();
  });

  test('updates completion progress using the full post-download stats without placeholder drift', async () => {
    const state: CompletionTrackingState = {
      completionMonitoringParams: null,
    };

    createTempDirectoryMock.mockResolvedValue('/tmp/twitchsync-custom/vod-9003');
    statMock.mockResolvedValue({ size: 4096 });
    isVodCompletedMock.mockResolvedValue(false);
    getTaskCompletionStatsMock.mockResolvedValue({
      completed_vods: 1,
      total_vods: 1,
      completion_percentage: 100,
    });
    twitchServiceMock.getVODInfo.mockResolvedValue({
      id: '9003',
      user_id: 'channel-10',
    });

    const { DownloadHandler } = require('../src/services/downloadManager/handlers/downloadHandler');
    const handler = new DownloadHandler(new CompletionTrackingPool(state) as any, '/tmp/base-handler-temp', 3);

    (handler as any).getVODPlaylist = jest.fn().mockResolvedValue({
      segments: [{ index: 0, url: 'https://example.com/segment-0.ts' }],
    });
    (handler as any).downloadSegmentsInParallel = jest.fn().mockResolvedValue(undefined);
    (handler as any).combineSegments = jest.fn().mockResolvedValue({
      outputPath: '/data/vods/final-9003.ts',
      checksum: 'md5-9003',
    });

    await expect(handler.processVOD({
      id: 403,
      twitch_id: '9003',
      task_id: 9,
      preferred_quality: 'source',
      duration: '1h0m0s',
      title: 'Completion smoke VOD',
      channel_name: 'smoke-channel',
    })).resolves.toBeUndefined();

    expect(state.completionMonitoringParams).toEqual([9, 1, 1, 100]);
    expect(emitDownloadStatusChangeMock).toHaveBeenCalledWith(403, 9, 'downloading', 0);
    expect(emitDownloadStatusChangeMock).toHaveBeenCalledWith(403, 9, 'completed', 100);
    expect(cleanupDirectoryMock).toHaveBeenCalledWith('/tmp/twitchsync-custom/vod-9003');
  });
});
