import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          key VARCHAR(100) NOT NULL UNIQUE,
          value JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create initial settings
        INSERT INTO settings (key, value) VALUES
        ('downloads', '{
          "downloadPath": "",
          "tempStorageLocation": "",
          "concurrentDownloadLimit": 3,
          "bandwidthThrottle": 0
        }'::jsonb),
        ('fileOrganization', '{
          "filenameTemplate": "{date}_{channel}_{title}",
          "folderStructure": "by_channel",
          "createDateBasedFolders": false,
          "createChannelFolders": true,
          "createGameFolders": true,
          "metadataFormat": "json"
        }'::jsonb),
        ('storage', '{
          "diskSpaceAlertThreshold": 10,
          "enableAutoCleanup": false,
          "cleanupThresholdGB": 50,
          "minAgeForCleanupDays": 30,
          "keepMetadataOnCleanup": true
        }'::jsonb),
        ('notifications', '{
          "enableEmailNotifications": false,
          "emailAddress": "",
          "enableDesktopNotifications": true,
          "enableDiscordWebhook": false,
          "discordWebhookUrl": "",
          "notifyOnDownloadStart": false,
          "notifyOnDownloadComplete": true,
          "notifyOnError": true,
          "notifyOnStorageAlert": true
        }'::jsonb)
        ON CONFLICT (key) DO NOTHING;

        -- Create function to update updated_at timestamp
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ language 'plpgsql';

        -- Create trigger to automatically update updated_at
        CREATE TRIGGER update_settings_updated_at
          BEFORE UPDATE ON settings
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      `);

      await client.query('COMMIT');
      logger.info('Settings table migration completed successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

export async function down(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      await client.query(`
        DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
        DROP FUNCTION IF EXISTS update_updated_at_column();
        DROP TABLE IF EXISTS settings;
      `);

      await client.query('COMMIT');
      logger.info('Settings table rollback completed successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Migration rollback failed:', error);
    throw error;
  }
}
