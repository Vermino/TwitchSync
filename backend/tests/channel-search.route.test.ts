import express from 'express';
import request from 'supertest';

const searchChannelsMock = jest.fn();

jest.mock('../src/services/twitch/service', () => ({
  TwitchService: {
    getInstance: jest.fn(() => ({
      searchChannels: searchChannelsMock,
    })),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Channel search route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('accepts the search term from the query string and returns results', async () => {
    const { setupChannelRoutes } = require('../src/routes/channels');
    searchChannelsMock.mockResolvedValue([
      {
        id: '1',
        twitch_id: '1',
        username: 'dolphin',
        display_name: 'Dolphin',
        profile_image_url: 'https://example.com/dolphin.jpg',
        follower_count: 1234,
        is_live: false,
        tags: [],
      },
    ]);

    const app = express();
    app.use(setupChannelRoutes({} as any));

    const response = await request(app)
      .get('/search')
      .query({ query: 'dolphin' });

    expect(response.status).toBe(200);
    expect(searchChannelsMock).toHaveBeenCalledWith('dolphin');
    expect(response.body[0]).toEqual(expect.objectContaining({
      username: 'dolphin',
      follower_count: 1234,
    }));
  });

  test('rejects missing search queries before reaching the controller', async () => {
    const { setupChannelRoutes } = require('../src/routes/channels');
    const app = express();
    app.use(setupChannelRoutes({} as any));

    const response = await request(app).get('/search');

    expect(response.status).toBe(400);
    expect(searchChannelsMock).not.toHaveBeenCalled();
  });
});
