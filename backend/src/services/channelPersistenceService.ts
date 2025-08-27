// Filepath: backend/src/services/channelPersistenceService.ts

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

interface ChannelBackup {
  id: number;
  twitch_id: string;
  username: string;
  display_name?: string;
  profile_image_url?: string;
  description?: string;
  follower_count: number;
  is_active: boolean;
  created_at: Date;
  backed_up_at: Date;
}

export class ChannelPersistenceService extends EventEmitter {
  private pool: Pool;
  private backupInterval: NodeJS.Timeout | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastKnownChannelCount = 0;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
  }

  /**
   * Start the channel persistence monitoring service
   */
  public async start(): Promise<void> {
    logger.info('Starting Channel Persistence Service...');

    try {
      // Create backup table if it doesn't exist
      await this.ensureBackupTable();

      // Get initial channel count
      this.lastKnownChannelCount = await this.getChannelCount();
      logger.info(`Initial channel count: ${this.lastKnownChannelCount}`);

      // Start periodic backup (every 30 minutes)
      this.backupInterval = setInterval(async () => {
        try {
          await this.backupChannels();
        } catch (error) {
          logger.error('Channel backup failed:', error);
        }
      }, 30 * 60 * 1000); // 30 minutes

      // Start monitoring for channel loss (every 5 minutes)
      this.monitoringInterval = setInterval(async () => {
        try {
          await this.monitorChannelIntegrity();
        } catch (error) {
          logger.error('Channel monitoring failed:', error);
        }
      }, 5 * 60 * 1000); // 5 minutes

      // Perform initial backup
      await this.backupChannels();
      
      logger.info('Channel Persistence Service started successfully');
      this.emit('service:started');
    } catch (error) {
      logger.error('Failed to start Channel Persistence Service:', error);
      throw error;
    }
  }

  /**
   * Stop the channel persistence service
   */
  public stop(): void {
    logger.info('Stopping Channel Persistence Service...');

    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('Channel Persistence Service stopped');
    this.emit('service:stopped');
  }

  /**
   * Ensure the backup table exists
   */
  private async ensureBackupTable(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS channels_backup (
          id SERIAL PRIMARY KEY,
          original_id INTEGER NOT NULL,
          twitch_id VARCHAR(50) NOT NULL,
          username VARCHAR(100) NOT NULL,
          display_name VARCHAR(100),
          profile_image_url TEXT,
          description TEXT,
          follower_count INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP NOT NULL,
          backed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(original_id, backed_up_at)
        );

        CREATE INDEX IF NOT EXISTS idx_channels_backup_twitch_id ON channels_backup(twitch_id);
        CREATE INDEX IF NOT EXISTS idx_channels_backup_original_id ON channels_backup(original_id);
        CREATE INDEX IF NOT EXISTS idx_channels_backup_username ON channels_backup(username);
      `);
      logger.debug('Channel backup table ensured');
    } finally {
      client.release();
    }
  }

  /**
   * Get current channel count
   */
  private async getChannelCount(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT COUNT(*) as count FROM channels WHERE is_active = true');
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  /**
   * Backup all channels to the backup table
   */
  private async backupChannels(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get all active channels
      const channelsResult = await client.query(`
        SELECT id, twitch_id, username, display_name, profile_image_url, 
               description, follower_count, is_active, created_at
        FROM channels 
        WHERE is_active = true
      `);

      const channels = channelsResult.rows;
      let backedUpCount = 0;

      for (const channel of channels) {
        // Insert into backup table (or update if exists for today)
        await client.query(`
          INSERT INTO channels_backup (
            original_id, twitch_id, username, display_name, 
            profile_image_url, description, follower_count, 
            is_active, created_at, backed_up_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (original_id, backed_up_at) DO UPDATE SET
            twitch_id = EXCLUDED.twitch_id,
            username = EXCLUDED.username,
            display_name = EXCLUDED.display_name,
            profile_image_url = EXCLUDED.profile_image_url,
            description = EXCLUDED.description,
            follower_count = EXCLUDED.follower_count,
            is_active = EXCLUDED.is_active,
            backed_up_at = NOW()
        `, [
          channel.id, channel.twitch_id, channel.username,
          channel.display_name, channel.profile_image_url,
          channel.description, channel.follower_count,
          channel.is_active, channel.created_at
        ]);
        backedUpCount++;
      }

      await client.query('COMMIT');
      logger.debug(`Backed up ${backedUpCount} channels`);
      
      this.emit('backup:completed', { count: backedUpCount });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Channel backup failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Monitor channel integrity and detect unexpected channel loss
   */
  private async monitorChannelIntegrity(): Promise<void> {
    const currentChannelCount = await this.getChannelCount();
    
    if (currentChannelCount < this.lastKnownChannelCount) {
      const lostChannels = this.lastKnownChannelCount - currentChannelCount;
      
      logger.warn(`CHANNEL LOSS DETECTED: ${lostChannels} channels lost!`);
      logger.warn(`Previous count: ${this.lastKnownChannelCount}, Current count: ${currentChannelCount}`);
      
      // Emit warning event
      this.emit('channel:loss_detected', {
        previousCount: this.lastKnownChannelCount,
        currentCount: currentChannelCount,
        lostCount: lostChannels,
        timestamp: new Date()
      });

      // Attempt automatic recovery if loss is significant
      if (lostChannels > 0) {
        logger.warn('Attempting automatic channel recovery...');
        try {
          await this.recoverLostChannels();
        } catch (error) {
          logger.error('Automatic channel recovery failed:', error);
        }
      }
    } else if (currentChannelCount > this.lastKnownChannelCount) {
      const newChannels = currentChannelCount - this.lastKnownChannelCount;
      logger.info(`${newChannels} new channels detected`);
      this.emit('channel:growth_detected', {
        previousCount: this.lastKnownChannelCount,
        currentCount: currentChannelCount,
        newCount: newChannels,
        timestamp: new Date()
      });
    }

    this.lastKnownChannelCount = currentChannelCount;
  }

  /**
   * Attempt to recover lost channels from backup
   */
  public async recoverLostChannels(): Promise<{ recovered: number; failed: number }> {
    logger.info('Starting channel recovery process...');
    
    const client = await this.pool.connect();
    const stats = { recovered: 0, failed: 0 };
    
    try {
      await client.query('BEGIN');

      // Find channels that exist in backup but not in main table
      const missingChannelsResult = await client.query(`
        SELECT DISTINCT ON (cb.twitch_id)
          cb.original_id, cb.twitch_id, cb.username, cb.display_name,
          cb.profile_image_url, cb.description, cb.follower_count,
          cb.is_active, cb.created_at
        FROM channels_backup cb
        LEFT JOIN channels c ON cb.twitch_id = c.twitch_id
        WHERE c.id IS NULL
        AND cb.is_active = true
        ORDER BY cb.twitch_id, cb.backed_up_at DESC
      `);

      const missingChannels = missingChannelsResult.rows;
      logger.info(`Found ${missingChannels.length} channels to recover`);

      for (const channel of missingChannels) {
        try {
          // Restore the channel
          await client.query(`
            INSERT INTO channels (
              twitch_id, username, display_name, profile_image_url,
              description, follower_count, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (twitch_id) DO NOTHING
          `, [
            channel.twitch_id, channel.username, channel.display_name,
            channel.profile_image_url, channel.description, channel.follower_count,
            channel.is_active, channel.created_at
          ]);

          stats.recovered++;
          logger.info(`Recovered channel: ${channel.username} (${channel.twitch_id})`);
        } catch (error) {
          stats.failed++;
          logger.error(`Failed to recover channel ${channel.username}:`, error);
        }
      }

      await client.query('COMMIT');
      
      logger.info(`Channel recovery completed: ${stats.recovered} recovered, ${stats.failed} failed`);
      this.emit('recovery:completed', stats);
      
      return stats;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Channel recovery process failed:', error);
      this.emit('recovery:failed', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get channel persistence statistics
   */
  public async getStats(): Promise<{
    activeChannels: number;
    backedUpChannels: number;
    lastBackup: Date | null;
    backupHistory: number;
  }> {
    const client = await this.pool.connect();
    try {
      // Get active channels count
      const activeResult = await client.query(
        'SELECT COUNT(*) as count FROM channels WHERE is_active = true'
      );
      
      // Get backed up channels count
      const backedUpResult = await client.query(
        'SELECT COUNT(DISTINCT twitch_id) as count FROM channels_backup'
      );
      
      // Get last backup time
      const lastBackupResult = await client.query(
        'SELECT MAX(backed_up_at) as last_backup FROM channels_backup'
      );
      
      // Get backup history count
      const historyResult = await client.query(
        'SELECT COUNT(*) as count FROM channels_backup'
      );

      return {
        activeChannels: parseInt(activeResult.rows[0].count),
        backedUpChannels: parseInt(backedUpResult.rows[0].count),
        lastBackup: lastBackupResult.rows[0].last_backup,
        backupHistory: parseInt(historyResult.rows[0].count)
      };
    } finally {
      client.release();
    }
  }

  /**
   * Manual backup trigger
   */
  public async triggerBackup(): Promise<void> {
    logger.info('Manual channel backup triggered');
    await this.backupChannels();
  }

  /**
   * Manual recovery trigger
   */
  public async triggerRecovery(): Promise<{ recovered: number; failed: number }> {
    logger.info('Manual channel recovery triggered');
    return await this.recoverLostChannels();
  }
}

export const createChannelPersistenceService = (pool: Pool) => 
  new ChannelPersistenceService(pool);