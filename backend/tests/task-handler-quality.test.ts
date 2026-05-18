export {};

type QueryResult = {
  rows: any[];
  rowCount: number;
};

type QualityHarnessState = {
  taskQuality: string | null;
  channelPreference: string | null;
  globalDefault: string | null;
  insertedPreferredQuality: string | null;
  insertedCount: number;
  insertedVodIds: Set<string>;
  queries: string[];
};

const twitchServiceMock = {
  getChannelVODs: jest.fn(),
  getVODInfo: jest.fn(),
  getChannelInfoById: jest.fn(),
  getGameById: jest.fn(),
};

jest.mock('../src/services/twitch/service', () => ({
  TwitchService: {
    getInstance: jest.fn(() => twitchServiceMock),
  },
}));

class QualityHarnessClient {
  constructor(private readonly state: QualityHarnessState) {}

  async query(queryText: string, params: any[] = []): Promise<QueryResult> {
    const sql = queryText.replace(/\s+/g, ' ').trim().toLowerCase();
    this.state.queries.push(sql);

    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
      return { rows: [], rowCount: 0 };
    }

    if (
      sql.includes('select t.*,')
      && sql.includes('array_agg(distinct c.twitch_id) as channel_twitch_ids')
      && sql.includes('where t.id = $1 and t.is_active = true')
    ) {
      return {
        rows: [{
          id: 1,
          user_id: 1,
          name: 'Quality precedence task',
          priority: 'medium',
          quality: this.state.taskQuality,
          channel_twitch_ids: ['channel-10'],
          channel_db_ids: [10],
          game_ids: [],
        }],
        rowCount: 1,
      };
    }

    if (
      sql.includes('select preferred_quality')
      && sql.includes('from user_vod_preferences')
      && sql.includes('where user_id = $1 and channel_id = $2')
    ) {
      return this.state.channelPreference
        ? { rows: [{ preferred_quality: this.state.channelPreference }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }

    if (
      sql.includes('from vods v')
      && sql.includes('left join completed_vods cv on cv.vod_id = v.id')
      && sql.includes('where v.task_id = $1')
      && sql.includes('group by v.channel_id')
    ) {
      return { rows: [], rowCount: 0 };
    }

    if (
      sql.includes('select value')
      && sql.includes('from system_settings')
      && sql.includes("where category = 'downloads' and key = 'default_quality'")
    ) {
      return this.state.globalDefault
        ? { rows: [{ value: JSON.stringify(this.state.globalDefault) }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }

    if (
      sql.startsWith('select id from games where twitch_game_id = $1')
    ) {
      return { rows: [{ id: 20 }], rowCount: 1 };
    }

    if (
      sql.includes('select acquire_vod_lock($1::bigint, $2) as acquired')
    ) {
      return { rows: [{ acquired: true }], rowCount: 1 };
    }

    if (
      sql.includes('select id from vods where twitch_id = $1::bigint')
    ) {
      const twitchVodId = String(params[0]);
      return this.state.insertedVodIds.has(twitchVodId)
        ? { rows: [{ id: 901 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }

    if (
      sql.includes('insert into vods (')
      && sql.includes('preferred_quality')
    ) {
      this.state.insertedCount += 1;
      this.state.insertedPreferredQuality = String(params[14]);
      this.state.insertedVodIds.add(String(params[0]));
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes('select safe_queue_vod_for_processing($1, $2, $3::bigint, $4)')
    ) {
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes('select release_vod_lock($1::bigint, $2) as released')
    ) {
      return { rows: [{ released: true }], rowCount: 1 };
    }

    if (
      sql.startsWith('update tasks set')
      || sql.startsWith('update task_monitoring set')
    ) {
      return { rows: [], rowCount: 1 };
    }

    console.error(`Unhandled quality harness query: ${sql}`);
    throw new Error(`Unhandled quality harness query: ${sql}`);
  }

  release() {}
}

class QualityHarnessPool {
  constructor(private readonly state: QualityHarnessState) {}

  async connect() {
    return new QualityHarnessClient(this.state);
  }
}

const createState = (overrides: Partial<QualityHarnessState> = {}): QualityHarnessState => ({
  taskQuality: null,
  channelPreference: null,
  globalDefault: 'source',
  insertedPreferredQuality: null,
  insertedCount: 0,
  insertedVodIds: new Set<string>(),
  queries: [],
  ...overrides,
});

describe('TaskHandler quality precedence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    twitchServiceMock.getChannelVODs.mockResolvedValue([
      {
        id: '9001',
        title: 'Quality smoke VOD',
      },
    ]);
    twitchServiceMock.getVODInfo.mockResolvedValue({
      id: '9001',
      user_id: 'channel-10',
      title: 'Quality smoke VOD',
      description: 'Test VOD',
      duration: '2h0m0s',
      type: 'archive',
      language: 'en',
      view_count: 123,
      thumbnail_url: 'https://example.com/vod-thumb.jpg',
      published_at: '2026-05-14T20:00:00.000Z',
      game_id: 'game-20',
    });
    twitchServiceMock.getChannelInfoById.mockResolvedValue({
      game_id: 'game-20',
    });
    twitchServiceMock.getGameById.mockResolvedValue(null);
  });

  test('prefers the task quality over channel and global defaults', async () => {
    const state = createState({
      taskQuality: '160p',
      channelPreference: '1080p60',
      globalDefault: '720p60',
    });

    const { TaskHandler } = require('../src/services/downloadManager/handlers/taskHandler');
    const handler = new TaskHandler(new QualityHarnessPool(state) as any, {} as any);

    await handler.executeTask(1, 'scan');

    expect(twitchServiceMock.getChannelVODs).toHaveBeenCalled();
    expect(twitchServiceMock.getVODInfo).toHaveBeenCalled();
    expect(state.insertedCount).toBe(1);
    expect(state.insertedPreferredQuality).toBe('160p');
  });

  test('uses the channel preference when the task quality is not set', async () => {
    const state = createState({
      taskQuality: null,
      channelPreference: '1080p',
      globalDefault: '720p60',
    });

    const { TaskHandler } = require('../src/services/downloadManager/handlers/taskHandler');
    const handler = new TaskHandler(new QualityHarnessPool(state) as any, {} as any);

    await handler.executeTask(1, 'scan');

    expect(state.insertedCount).toBe(1);
    expect(state.insertedPreferredQuality).toBe('1080p');
  });

  test('falls back to the global default when neither task nor channel overrides exist', async () => {
    const state = createState({
      taskQuality: null,
      channelPreference: null,
      globalDefault: '720p',
    });

    const { TaskHandler } = require('../src/services/downloadManager/handlers/taskHandler');
    const handler = new TaskHandler(new QualityHarnessPool(state) as any, {} as any);

    await handler.executeTask(1, 'scan');

    expect(state.insertedCount).toBe(1);
    expect(state.insertedPreferredQuality).toBe('720p');
  });
});
