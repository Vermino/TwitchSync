import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { Pool } from 'pg';
import { RecommendationsManager } from './src/services/discovery/recommendations-manager';
import { TwitchService } from './src/services/twitch/service';

async function main() {
    const pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'twitch_sync',
        password: process.env.DB_PASSWORD || 'postgres',
        port: parseInt(process.env.DB_PORT || '5432')
    });

    process.env.TWITCH_CLIENT_ID = 'dummy';
    process.env.TWITCH_CLIENT_SECRET = 'dummy';
    const twitchService = TwitchService.getInstance();
    const RM = new RecommendationsManager(pool, twitchService);

    const prefs: any = {
        min_viewers: 10,
        max_viewers: 999999,
        preferred_languages: ['en'],
        tags: ['speedrun', 'vtuber'],
        confidence_threshold: 0.1
    };

    console.log("Testing Recommendations Manager filters...");
    try {
        const recs = await RM.getChannelRecommendations('1', prefs);
        console.log(`Successfully retrieved ${recs.length} recommendations`);
    } catch (error) {
        console.error("Crash:", error);
    } finally {
        pool.end();
    }
}

main();
