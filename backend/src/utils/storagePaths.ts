import os from 'os';
import path from 'path';

type StoragePathEnv = {
  DOWNLOAD_PATH?: string;
  STORAGE_PATH?: string;
  VOD_STORAGE_HOST_PATH?: string;
};

export interface DownloadPathResolution {
  configuredPath: string | null;
  displayPath: string;
  runtimePath: string;
  runtimeOverride: string | null;
  usedRuntimeOverride: boolean;
}

const stripWrappedQuotes = (value?: string | null) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/^"|"$/g, '').trim();
  return normalized.length > 0 ? normalized : null;
};

const getFallbackDownloadPath = () => path.join(os.homedir(), 'TwitchSync', 'Downloads');

const isAbsoluteForPlatform = (value: string, platform: NodeJS.Platform) => {
  if (platform === 'win32') {
    return path.win32.isAbsolute(value);
  }

  return path.posix.isAbsolute(value);
};

export const resolveDownloadPath = (
  configuredValue?: string | null,
  platform: NodeJS.Platform = process.platform,
  env: StoragePathEnv = process.env as StoragePathEnv
): DownloadPathResolution => {
  const configuredPath = stripWrappedQuotes(configuredValue);
  const runtimeOverride = stripWrappedQuotes(env.DOWNLOAD_PATH || env.STORAGE_PATH || null);
  const displayFallback = stripWrappedQuotes(env.VOD_STORAGE_HOST_PATH || null)
    || runtimeOverride
    || getFallbackDownloadPath();
  const runtimeFallback = runtimeOverride || getFallbackDownloadPath();

  const usedRuntimeOverride = Boolean(runtimeOverride) && (
    !configuredPath || !isAbsoluteForPlatform(configuredPath, platform)
  );

  return {
    configuredPath,
    displayPath: configuredPath || displayFallback,
    runtimePath: usedRuntimeOverride ? runtimeOverride! : (configuredPath || runtimeFallback),
    runtimeOverride,
    usedRuntimeOverride,
  };
};
