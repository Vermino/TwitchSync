export {};

type QueryResult = {
  rows: any[];
  rowCount: number;
};

const twitchServiceMock = {
  getChannelFollowers: jest.fn(),
};

jest.mock('../src/services/twitch/service', () => ({
  TwitchService: {
    getInstance: jest.fn(() => twitchServiceMock),
  },
}));

const createRestrictionState = (overrides: Partial<any> = {}) => ({
  totalVodCount: 0,
  totalStorageBytes: 0,
  channelVodCounts: new Map<number, number>(),
  channelStorageBytes: new Map<number, number>(),
  channelFollowerCounts: new Map<number, number>(),
  ...overrides,
});

describe('TaskHandler task criteria enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('matches Diablo IV stream title aliases and common typos', () => {
    const { TaskHandler } = require('../src/services/downloadManager/handlers/taskHandler');
    const handler = new TaskHandler({} as any, {} as any);

    const typoResult = handler['checkGameMatch'](
      'Daiblo IV - Campaign & Lore Run before Lord of Hatred! - Show #3729',
      ['Diablo IV']
    );
    expect(typoResult.matches).toBe(true);
    expect(typoResult.matchedGame).toBe('Diablo IV');

    const numericAliasResult = handler['checkGameMatch'](
      'Diablo 4 seasonal campaign run',
      ['Diablo IV']
    );
    expect(numericAliasResult.matches).toBe(true);

    const shortAliasResult = handler['checkGameMatch'](
      'D4 hardcore run continues',
      ['Diablo IV']
    );
    expect(shortAliasResult.matches).toBe(true);
  });

  test('rejects VODs that do not satisfy view, duration, and language conditions', () => {
    const { TaskHandler } = require('../src/services/downloadManager/handlers/taskHandler');
    const handler = new TaskHandler({} as any, {} as any);

    const result = handler['evaluateCandidateForQueueing'](
      {
        id: 'vod-101',
        user_id: 'channel-1',
        user_name: 'Channel One',
        title: 'Criteria test',
        description: '',
        created_at: '2026-05-16T01:00:00.000Z',
        published_at: '2026-05-16T01:00:00.000Z',
        url: 'https://example.com/vod-101',
        thumbnail_url: 'https://example.com/thumb.jpg',
        viewable: 'public',
        view_count: 12,
        language: 'es',
        type: 'archive',
        duration: '20m0s',
        muted_segments: null,
      },
      55,
      '720p',
      {
        minViews: 25,
        minDuration: 45,
        languages: ['en'],
      },
      {},
      createRestrictionState()
    );

    expect(result.shouldQueue).toBe(false);
    expect(result.code).toBe('MIN_VIEWS');
  });

  test('rejects VODs that fail the configured language filter after other thresholds pass', () => {
    const { TaskHandler } = require('../src/services/downloadManager/handlers/taskHandler');
    const handler = new TaskHandler({} as any, {} as any);

    const result = handler['evaluateCandidateForQueueing'](
      {
        id: 'vod-101b',
        user_id: 'channel-1',
        user_name: 'Channel One',
        title: 'Language criteria test',
        description: '',
        created_at: '2026-05-16T01:00:00.000Z',
        published_at: '2026-05-16T01:00:00.000Z',
        url: 'https://example.com/vod-101b',
        thumbnail_url: 'https://example.com/thumb.jpg',
        viewable: 'public',
        view_count: 120,
        language: 'de',
        type: 'archive',
        duration: '1h15m0s',
        muted_segments: null,
      },
      55,
      '720p',
      {
        minViews: 25,
        minDuration: 45,
        languages: ['en', 'fr'],
      },
      {},
      createRestrictionState()
    );

    expect(result.shouldQueue).toBe(false);
    expect(result.code).toBe('LANGUAGE_FILTER');
  });

  test('accepts VODs that satisfy conditions and updates restriction state when queued', () => {
    const { TaskHandler } = require('../src/services/downloadManager/handlers/taskHandler');
    const handler = new TaskHandler({} as any, {} as any);
    const restrictionState = createRestrictionState();

    const result = handler['evaluateCandidateForQueueing'](
      {
        id: 'vod-102',
        user_id: 'channel-1',
        user_name: 'Channel One',
        title: 'Passing VOD',
        description: '',
        created_at: '2026-05-16T01:00:00.000Z',
        published_at: '2026-05-16T01:00:00.000Z',
        url: 'https://example.com/vod-102',
        thumbnail_url: 'https://example.com/thumb.jpg',
        viewable: 'public',
        view_count: 200,
        language: 'en',
        type: 'archive',
        duration: '2h0m0s',
        muted_segments: null,
      },
      55,
      '720p',
      {
        minViews: 25,
        minDuration: 45,
        languages: ['en'],
      },
      {
        maxVodsPerChannel: 2,
        maxTotalVods: 4,
      },
      restrictionState
    );

    expect(result.shouldQueue).toBe(true);
    expect(result.estimatedSizeBytes).toBeGreaterThan(0);

    handler['applyCandidateToRestrictionState'](55, result.estimatedSizeBytes, restrictionState);

    expect(restrictionState.totalVodCount).toBe(1);
    expect(restrictionState.channelVodCounts.get(55)).toBe(1);
    expect(restrictionState.totalStorageBytes).toBe(result.estimatedSizeBytes);
  });

  test('enforces VOD count and storage restrictions against the current task state', () => {
    const { TaskHandler } = require('../src/services/downloadManager/handlers/taskHandler');
    const handler = new TaskHandler({} as any, {} as any);

    const maxVodsResult = handler['evaluateCandidateForQueueing'](
      {
        id: 'vod-103',
        user_id: 'channel-1',
        user_name: 'Channel One',
        title: 'Count limited VOD',
        description: '',
        created_at: '2026-05-16T01:00:00.000Z',
        published_at: '2026-05-16T01:00:00.000Z',
        url: 'https://example.com/vod-103',
        thumbnail_url: 'https://example.com/thumb.jpg',
        viewable: 'public',
        view_count: 300,
        language: 'en',
        type: 'archive',
        duration: '1h0m0s',
        muted_segments: null,
      },
      55,
      '720p',
      {},
      {
        maxVodsPerChannel: 2,
      },
      createRestrictionState({
        totalVodCount: 2,
        channelVodCounts: new Map([[55, 2]]),
      })
    );

    expect(maxVodsResult.shouldQueue).toBe(false);
    expect(maxVodsResult.code).toBe('MAX_VODS_PER_CHANNEL');

    const maxStorageResult = handler['evaluateCandidateForQueueing'](
      {
        id: 'vod-104',
        user_id: 'channel-1',
        user_name: 'Channel One',
        title: 'Storage limited VOD',
        description: '',
        created_at: '2026-05-16T01:00:00.000Z',
        published_at: '2026-05-16T01:00:00.000Z',
        url: 'https://example.com/vod-104',
        thumbnail_url: 'https://example.com/thumb.jpg',
        viewable: 'public',
        view_count: 300,
        language: 'en',
        type: 'archive',
        duration: '3h0m0s',
        muted_segments: null,
      },
      55,
      '1080p60',
      {},
      {
        maxTotalStorage: 10,
      },
      createRestrictionState({
        totalStorageBytes: 9.5 * 1024 * 1024 * 1024,
      })
    );

    expect(maxStorageResult.shouldQueue).toBe(false);
    expect(maxStorageResult.code).toBe('MAX_TOTAL_STORAGE');
  });

  test('checks channel follower minimums using cached or refreshed channel data', async () => {
    const { TaskHandler } = require('../src/services/downloadManager/handlers/taskHandler');
    const handler = new TaskHandler({} as any, {} as any);
    const state = createRestrictionState();

    const client = {
      query: jest.fn(async (queryText: string): Promise<QueryResult> => {
        const sql = queryText.replace(/\s+/g, ' ').trim().toLowerCase();

        if (sql.includes('select follower_count from channels where id = $1 and is_active = true')) {
          return { rows: [{ follower_count: 250 }], rowCount: 1 };
        }

        throw new Error(`Unhandled query in follower test: ${sql}`);
      }),
    };

    const result = await handler['evaluateChannelConditions'](
      22,
      'channel-22',
      { minFollowers: 500 },
      state,
      client
    );

    expect(result.shouldQueue).toBe(false);
    expect(result.code).toBe('MIN_FOLLOWERS');
    expect(twitchServiceMock.getChannelFollowers).not.toHaveBeenCalled();
  });

  test('refreshes follower counts from Twitch when the stored channel count is missing', async () => {
    const { TaskHandler } = require('../src/services/downloadManager/handlers/taskHandler');
    const handler = new TaskHandler({} as any, {} as any);
    const state = createRestrictionState();
    twitchServiceMock.getChannelFollowers.mockResolvedValue(4200);

    const client = {
      query: jest.fn(async (queryText: string): Promise<QueryResult> => {
        const sql = queryText.replace(/\s+/g, ' ').trim().toLowerCase();

        if (sql.includes('select follower_count from channels where id = $1 and is_active = true')) {
          return { rows: [{ follower_count: 0 }], rowCount: 1 };
        }

        if (sql.startsWith('update channels set follower_count = $2,')) {
          return { rows: [], rowCount: 1 };
        }

        throw new Error(`Unhandled query in follower refresh test: ${sql}`);
      }),
    };

    const result = await handler['evaluateChannelConditions'](
      44,
      'channel-44',
      { minFollowers: 500 },
      state,
      client
    );

    expect(result.shouldQueue).toBe(true);
    expect(twitchServiceMock.getChannelFollowers).toHaveBeenCalledWith('channel-44');
    expect(state.channelFollowerCounts.get(44)).toBe(4200);
  });
});
