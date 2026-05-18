import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface SeedState {
  baseUrl: string;
  token: string;
  user: {
    id: number;
    username: string;
    twitchId: string;
  };
  fixtures: {
    seededTaskId: number;
    seededVodId: number;
    channelName: string;
    gameName: string;
    seededTaskName: string;
    seededVodTitle: string;
    createdTaskPrefix: string;
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authDir = path.resolve(__dirname, '../.auth');
const seedStatePath = path.join(authDir, 'seed-state.json');

export function readSeedState(): SeedState {
  return JSON.parse(fs.readFileSync(seedStatePath, 'utf8')) as SeedState;
}
