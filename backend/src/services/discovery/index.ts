// Filepath: backend/src/services/discovery/index.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import twitchService, { TwitchService } from '../twitch/service';
import { PreferencesManager } from './preferences-manager';
import { RecommendationsManager } from './recommendations-manager';
import { Recommendation, ChannelRecommendation, GameRecommendation } from '../../types/discovery';

export class DiscoveryService {
  private static instance: DiscoveryService;
  private preferencesManager: PreferencesManager;
  private recommendationsManager: RecommendationsManager;

  private constructor(
    private pool: Pool,
    private twitch: TwitchService = twitchService
  ) {
    this.preferencesManager = new PreferencesManager(pool);
    this.recommendationsManager = new RecommendationsManager(pool, this.twitch);
  }

  public static getInstance(pool: Pool): DiscoveryService {
    if (!DiscoveryService.instance) {
      DiscoveryService.instance = new DiscoveryService(pool);
    }
    return DiscoveryService.instance;
  }

  async getChannelRecommendations(userId: string, overrides: Partial<import('../../types/discovery').UserPreferences> = {}): Promise<ChannelRecommendation[]> {
    const client = await this.pool.connect();
    try {
      const userPrefs = await this.preferencesManager.getUserPreferences(userId, client);
      const activePrefs = { ...userPrefs, ...overrides };
      return await this.recommendationsManager.getChannelRecommendations(userId, activePrefs);
    } catch (error) {
      logger.error('Error getting channel recommendations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getGameRecommendations(userId: string, overrides: Partial<import('../../types/discovery').UserPreferences> = {}): Promise<GameRecommendation[]> {
    const client = await this.pool.connect();
    try {
      const userPrefs = await this.preferencesManager.getUserPreferences(userId, client);
      const activePrefs = { ...userPrefs, ...overrides };
      return await this.recommendationsManager.getGameRecommendations(userId, activePrefs);
    } catch (error) {
      logger.error('Error getting game recommendations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async ignoreItem(userId: string, itemType: string, itemId: string): Promise<void> {
    await this.preferencesManager.ignoreDiscoveryItem(userId, itemType, itemId);
  }
}

export const discoveryService = (pool: Pool) => DiscoveryService.getInstance(pool);
export default discoveryService;
