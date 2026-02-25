// Filepath: backend/src/services/discovery/preferences-manager.ts

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { UserPreferences } from '../../types/discovery';

export class PreferencesManager {
  constructor(private pool: Pool) { }

  private getDefaultPreferences(): UserPreferences {
    return {
      id: 0,
      user_id: 0,
      min_viewers: 0, // Lowered to 0 to capture smaller niche historic VODs
      max_viewers: 1000000,
      preferred_languages: ['en'],
      content_rating: 'all',
      notify_only: false,
      schedule_match: true,
      confidence_threshold: 0.7,
      created_at: new Date(),
      updated_at: new Date()
    };
  }

  async getUserPreferences(userId: string, client: PoolClient): Promise<UserPreferences> {
    try {
      const result = await client.query<UserPreferences>(`
        SELECT 
          id,
          user_id,
          min_viewers,
          max_viewers,
          preferred_languages,
          content_rating,
          notify_only,
          schedule_match,
          confidence_threshold,
          created_at,
          updated_at
        FROM discovery_preferences
        WHERE user_id = $1
      `, [userId]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Create default preferences if none exist
      return this.createDefaultPreferences(userId, client);
    } catch (error) {
      logger.error('Error getting user preferences:', error);
      throw error;
    }
  }

  private async createDefaultPreferences(userId: string, client: PoolClient): Promise<UserPreferences> {
    const defaults = this.getDefaultPreferences();

    try {
      const result = await client.query<UserPreferences>(`
        INSERT INTO discovery_preferences (
          user_id,
          min_viewers,
          max_viewers,
          preferred_languages,
          content_rating,
          notify_only,
          schedule_match,
          confidence_threshold,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        userId,
        defaults.min_viewers,
        defaults.max_viewers,
        defaults.preferred_languages,
        defaults.content_rating,
        defaults.notify_only,
        defaults.schedule_match,
        defaults.confidence_threshold,
        defaults.created_at,
        defaults.updated_at
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating default preferences:', error);
      throw error;
    }
  }

  async updatePreferences(
    userId: string,
    updates: Partial<UserPreferences>,
    client: PoolClient
  ): Promise<UserPreferences> {
    try {
      // Validate updates
      if (updates.min_viewers && updates.max_viewers &&
        updates.min_viewers > updates.max_viewers) {
        throw new Error('min_viewers must be less than max_viewers');
      }

      if (updates.confidence_threshold !== undefined &&
        (updates.confidence_threshold < 0 || updates.confidence_threshold > 1)) {
        throw new Error('confidence_threshold must be between 0 and 1');
      }

      const result = await client.query<UserPreferences>(`
        UPDATE discovery_preferences
        SET
          min_viewers = COALESCE($1, min_viewers),
          max_viewers = COALESCE($2, max_viewers),
          preferred_languages = COALESCE($3, preferred_languages),
          content_rating = COALESCE($4, content_rating),
          notify_only = COALESCE($5, notify_only),
          schedule_match = COALESCE($6, schedule_match),
          confidence_threshold = COALESCE($7, confidence_threshold),
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $8
        RETURNING *
      `, [
        updates.min_viewers,
        updates.max_viewers,
        updates.preferred_languages,
        updates.content_rating,
        updates.notify_only,
        updates.schedule_match,
        updates.confidence_threshold,
        userId
      ]);

      if (result.rows.length === 0) {
        throw new Error('User preferences not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating preferences:', error);
      throw error;
    }
  }

  async deletePreferences(userId: string, client: PoolClient): Promise<void> {
    try {
      await client.query(`
        DELETE FROM discovery_preferences
        WHERE user_id = $1
      `, [userId]);
    } catch (error) {
      logger.error('Error deleting preferences:', error);
      throw error;
    }
  }

  async ignoreDiscoveryItem(userId: string, itemType: string, itemId: string, client?: PoolClient): Promise<void> {
    const dbClient = client || await this.pool.connect();
    try {
      await dbClient.query(`
        INSERT INTO ignored_discovery_items (user_id, item_type, item_id, created_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `, [userId, itemType, itemId]);
    } catch (error) {
      logger.error('Error ignoring discovery item:', error);
      throw error;
    } finally {
      if (!client) {
        dbClient.release();
      }
    }
  }
}

export default PreferencesManager;
