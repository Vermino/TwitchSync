import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { Pool } from 'pg';
import TwitchAPIService from './src/services/twitch';
import DownloadManager from './src/services/downloadManager';
import { TaskOperations } from './src/routes/tasks/operations';
import { logger } from './src/utils/logger';

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5435'),
    database: process.env.DB_NAME || 'twitchsync',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'James2004!'
});

async function run() {
    try {
        const twitchService = TwitchAPIService.getInstance();

        // 1. Find Celerity
        logger.info('Searching for Celerity on Twitch...');
        const result = await twitchService.searchChannels('Celerity');
        const channel = result.data.find(c => c.display_name.toLowerCase() === 'celerity' || (c as any).broadcaster_login?.toLowerCase() === 'celerity');

        if (!channel) {
            throw new Error('Could not find Celerity on Twitch');
        }

        logger.info(`Found Celerity: ID=${channel.id}, Login=${(channel as any).broadcaster_login || 'celerity'}`);

        const client = await pool.connect();
        let dbChannelId: number;
        let userId = 1;

        try {
            // 2. Ensure test user exists
            const userRes = await client.query('SELECT id FROM users LIMIT 1');
            if (userRes.rows.length > 0) {
                userId = userRes.rows[0].id;
            } else {
                const newUser = await client.query(
                    "INSERT INTO users (twitch_id, username, email) VALUES ($1, $2, $3) RETURNING id",
                    ['test_user_twitch', 'TestUser', 'test@test.com']
                );
                userId = newUser.rows[0].id;
            }

            // 3. Ensure channel is tracked
            const channelRes = await client.query(
                "SELECT id FROM channels WHERE twitch_id = $1",
                [channel.id]
            );

            if (channelRes.rows.length > 0) {
                dbChannelId = channelRes.rows[0].id;
            } else {
                const newChannel = await client.query(
                    "INSERT INTO channels (twitch_id, username, display_name) VALUES ($1, $2, $3) RETURNING id",
                    [channel.id, (channel as any).broadcaster_login || 'celerity', channel.display_name]
                );
                dbChannelId = newChannel.rows[0].id;
            }
        } finally {
            client.release();
        }

        // 4. Initialize DownloadManager and TaskOperations
        const downloadManager = DownloadManager.getInstance(pool, {
            tempDir: process.env.TEMP_DIR || './temp',
            maxConcurrent: 1,
            retryAttempts: 3,
            retryDelay: 5000,
            cleanupInterval: 3600
        });

        const taskOps = new TaskOperations(pool, downloadManager);

        // 5. Create Task
        logger.info('Creating Download Task for Celerity...');
        const task = await taskOps.createTask(userId, {
            name: 'Download Celerity VODs test',
            task_type: 'channel',
            channel_ids: [dbChannelId],
            game_ids: [],
            schedule_type: 'manual',
            schedule_value: 'manual',
            auto_delete: false,
            is_active: false,
            priority: 'high'
        });

        logger.info(`Created Task ID: ${task.id}`);

        // 6. Activating task
        logger.info('Activating Task to trigger discovery & downloads...');
        await taskOps.activateTask(task.id, userId);

        logger.info('Task Activated Successfully. It is now running in the background.');

        // Wait a brief moment to let logs output
        await new Promise(r => setTimeout(r, 5000));

    } catch (error) {
        logger.error('Test failed:', error);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

run();
