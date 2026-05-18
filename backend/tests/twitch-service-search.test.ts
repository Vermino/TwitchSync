export {};

describe('TwitchService channel search enrichment', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'test-client-id';
    process.env.TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'test-client-secret';
  });

  test('sorts channel search results by real follower count and prefers profile images', async () => {
    const { TwitchService } = require('../src/services/twitch/service');
    const service = TwitchService.getInstance();

    jest.spyOn(service.apiClient, 'searchChannels').mockResolvedValue([
      {
        id: '1',
        login: 'smallchannel',
        display_name: 'Small Channel',
        profile_image_url: 'https://example.com/stream-thumb-small.jpg',
        offline_image_url: '',
        description: 'Lower follower count',
        view_count: 90000,
        broadcaster_type: '',
        tags: ['indie'],
      },
      {
        id: '2',
        login: 'bigchannel',
        display_name: 'Big Channel',
        profile_image_url: 'https://example.com/stream-thumb-big.jpg',
        offline_image_url: '',
        description: 'Higher follower count',
        view_count: 1500,
        broadcaster_type: '',
        tags: ['variety'],
      },
    ]);
    jest.spyOn(service.apiClient, 'getUsersByIds').mockResolvedValue([
      { id: '1', profile_image_url: 'https://example.com/profile-small.jpg' },
      { id: '2', profile_image_url: 'https://example.com/profile-big.jpg' },
    ]);
    jest.spyOn(service, 'getChannelFollowers')
      .mockImplementation(async (...args: unknown[]) => (args[0] === '2' ? 9000 : 1200));
    jest.spyOn(service, 'getCurrentGame')
      .mockImplementation(async (...args: unknown[]) => (args[0] === '2'
        ? { id: 'game-1', name: 'The Bazaar', box_art_url: 'https://example.com/game.jpg', category: 'the', tags: [], last_checked: '', status: 'active', is_active: true }
        : null));

    const results = await service.searchChannels('channel');

    expect(results).toHaveLength(2);
    expect(results.map((channel: any) => channel.id)).toEqual(['2', '1']);
    expect(results[0].follower_count).toBe(9000);
    expect(results[0].profile_image_url).toBe('https://example.com/profile-big.jpg');
    expect(results[0].current_game?.name).toBe('The Bazaar');
    expect(results[1].follower_count).toBe(1200);
    expect(results[1].profile_image_url).toBe('https://example.com/profile-small.jpg');
  });

  test('fills missing display names from login data so the UI can render safely', async () => {
    const { TwitchService } = require('../src/services/twitch/service');
    const service = TwitchService.getInstance();

    jest.spyOn(service.apiClient, 'searchChannels').mockResolvedValue([
      {
        id: '3',
        login: 'namelesschannel',
        display_name: '',
        profile_image_url: 'https://example.com/thumb.jpg',
        offline_image_url: '',
        description: 'No display name from Twitch',
        view_count: 100,
        broadcaster_type: '',
        tags: [],
      },
    ]);
    jest.spyOn(service.apiClient, 'getUsersByIds').mockResolvedValue([
      { id: '3', profile_image_url: 'https://example.com/profile.jpg' },
    ]);
    jest.spyOn(service, 'getChannelFollowers').mockResolvedValue(42);
    jest.spyOn(service, 'getCurrentGame').mockResolvedValue(null);

    const results = await service.searchChannels('nameless');

    expect(results).toHaveLength(1);
    expect(results[0].display_name).toBe('namelesschannel');
    expect(results[0].username).toBe('namelesschannel');
  });
});
