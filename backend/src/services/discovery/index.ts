// Filepath: backend/src/services/discovery/index.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import twitchService, { TwitchService } from '../twitch/service';
import { PreferencesManager } from './preferences-manager';
import { RecommendationsManager } from './recommendations-manager';
import { PremiereDetector } from './premiere-detector';
import { Recommendation } from '../../types/discovery';

export class DiscoveryService {
  private static instance: DiscoveryService;
  private checkInterval: NodeJS.Timeout | null = null;
  private preferencesManager: PreferencesManager;
  private recommendationsManager: RecommendationsManager;
  private premiereDetector: PremiereDetector;

  private constructor(
    private pool: Pool,
    private twitch: TwitchService = twitchService
  ) {
    this.preferencesManager = new PreferencesManager(pool);
    this.recommendationsManager = new RecommendationsManager(pool, this.twitch);
    this.premiereDetector = new PremiereDetector(pool, this.twitch);
  }

  public static getInstance(pool: Pool): DiscoveryService {
    if (!DiscoveryService.instance) {
      DiscoveryService.instance = new DiscoveryService(pool);
    }
    return DiscoveryService.instance;
  }

  async getRecommendations(userId: string): Promise<Recommendation[]> {
    const client = await this.pool.connect();
    try {
      const userPrefs = await this.preferencesManager.getUserPreferences(userId, client);

      const [channels, games] = await Promise.all([
        this.recommendationsManager.getChannelRecommendations(userId, userPrefs),
        this.recommendationsManager.getGameRecommendations(userId)
      ]);

      return [...channels, ...games].sort((a, b) => b.compatibility_score - a.compatibility_score);
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async startMonitoring(checkIntervalMinutes: number = 15): Promise<void> {
    logger.info(`Starting discovery monitoring with ${checkIntervalMinutes} minute interval`);

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    await this.runMonitoringCycle();

    this.checkInterval = setInterval(async () => {
      await this.runMonitoringCycle();
    }, checkIntervalMinutes * 60 * 1000);
  }

  private async runMonitoringCycle(): Promise<void> {
    try {
      await this.premiereDetector.detectPremieres();
      await this.cleanupOldEvents();
    } catch (error) {
      logger.error('Error in discovery monitoring cycle:', error);
    }
  }

  async stopMonitoring(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async cleanupOldEvents(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Remove old premiere events
      await client.query(`
        DELETE FROM premiere_events
        WHERE start_time < NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 
          FROM user_premiere_tracking 
          WHERE premiere_id = premiere_events.id
        )
      `);

      // Archive old metrics
      await client.query(`
        INSERT INTO channel_metrics_archive
        SELECT *
        FROM channel_metrics
        WHERE recorded_at < NOW() - INTERVAL '30 days'
      `);

      // Delete archived metrics
      await client.query(`
        DELETE FROM channel_metrics
        WHERE recorded_at < NOW() - INTERVAL '30 days'
      `);
    } catch (error) {
      logger.error('Error cleaning up old events:', error);
    } finally {
      client.release();
    }
  }
}

export const discoveryService = (pool: Pool) => DiscoveryService.getInstance(pool);
export default discoveryService;
