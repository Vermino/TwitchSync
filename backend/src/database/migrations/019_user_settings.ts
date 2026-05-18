// Filepath: backend/src/database/migrations/019_user_settings.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    logger.info('Starting user settings migration');

    // First check if table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name = 'user_settings'
      );
    `);

    if (!tableExists.rows[0].exists) {
      logger.info('Creating user_settings table');
      // Create user settings table
      await client.query(`
        CREATE TABLE user_settings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          settings JSONB NOT NULL DEFAULT '{
            "downloads": {
              "downloadPath": "",
              "tempStorageLocation": "",
              "concurrentDownloadLimit": 3,
              "bandwidthThrottle": 0
            },
            "fileOrganization": {
              "filenameTemplate": "{date}_{channel}_{title}",
              "folderStructure": "by_channel",
              "createDateBasedFolders": false,
              "createChannelFolders": true,
              "createGameFolders": true,
              "metadataFormat": "json"
            },
            "storage": {
              "diskSpaceAlertThreshold": 10,
              "enableAutoCleanup": false,
              "cleanupThresholdGB": 50,
              "minAgeForCleanupDays": 30,
              "keepMetadataOnCleanup": true
            }
          }'::jsonb,
          notification_settings JSONB NOT NULL DEFAULT '{
            "enableEmailNotifications": false,
            "emailAddress": "",
            "enableDesktopNotifications": true,
            "enableDiscordWebhook": false,
            "discordWebhookUrl": "",
            "notifyOnDownloadStart": false,
            "notifyOnDownloadComplete": true,
            "notifyOnError": true,
            "notifyOnStorageAlert": true
          }'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id)
        );

        CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
      `);
      logger.info('User_settings table created successfully');
    } else {
      logger.info('User_settings table already exists');
    }

    // Create or replace update trigger
    logger.info('Creating timestamp update trigger');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_user_settings_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_user_settings_timestamp ON user_settings;
      
      CREATE TRIGGER update_user_settings_timestamp
          BEFORE UPDATE ON user_settings
          FOR EACH ROW
          EXECUTE FUNCTION update_user_settings_timestamp();
    `);

    // Create default settings for existing users
    logger.info('Creating default settings for existing users');
    await client.query(`
      INSERT INTO user_settings (user_id)
      SELECT id as user_id
      FROM users
      WHERE NOT EXISTS (
        SELECT 1 FROM user_settings us WHERE us.user_id = users.id
      );
    `);

    await client.query('COMMIT');
    logger.info('User settings migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in user settings migration:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    logger.info('Starting user settings rollback');

    await client.query(`
      DROP TRIGGER IF EXISTS update_user_settings_timestamp ON user_settings;
      DROP FUNCTION IF EXISTS update_user_settings_timestamp();
      DROP TABLE IF EXISTS user_settings CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('User settings rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in user settings rollback:', error);
    throw error;
  } finally {
    client.release();
  }
};
