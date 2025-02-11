// Filepath: backend/src/services/twitch/index.ts

import { TwitchService } from './service';
import { Pool } from 'pg';

// Initialize with default pool
let defaultPool: Pool;
try {
  defaultPool = require('../../config/database').pool;
} catch (error) {
  console.warn('Database pool not found, service will need to be initialized manually');
}

const twitchService = TwitchService.getInstance();

export { twitchService };
export * from './types';
export * from './base-client';
export * from './api-client';
export * from './service';

export default twitchService;
