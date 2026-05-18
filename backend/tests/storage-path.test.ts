import { resolveDownloadPath } from '../src/utils/storagePaths';

describe('resolveDownloadPath', () => {
  test('uses the runtime container path when a Windows host path is configured on Linux', () => {
    const resolution = resolveDownloadPath(
      'C:\\Users\\jesse\\TwitchSync\\Downloads',
      'linux',
      {
        DOWNLOAD_PATH: '/data/vods',
        STORAGE_PATH: '/data/vods',
        VOD_STORAGE_HOST_PATH: 'C:/Users/jesse/TwitchSync/Downloads',
      }
    );

    expect(resolution.displayPath).toBe('C:\\Users\\jesse\\TwitchSync\\Downloads');
    expect(resolution.runtimePath).toBe('/data/vods');
    expect(resolution.usedRuntimeOverride).toBe(true);
  });

  test('preserves absolute platform-native paths', () => {
    const resolution = resolveDownloadPath(
      '/mnt/media/twitchsync',
      'linux',
      {
        DOWNLOAD_PATH: '/data/vods',
        STORAGE_PATH: '/data/vods',
        VOD_STORAGE_HOST_PATH: null as never,
      }
    );

    expect(resolution.displayPath).toBe('/mnt/media/twitchsync');
    expect(resolution.runtimePath).toBe('/mnt/media/twitchsync');
    expect(resolution.usedRuntimeOverride).toBe(false);
  });
});
