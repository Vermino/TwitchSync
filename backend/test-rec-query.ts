import 'dotenv/config';
import { Pool } from 'pg';
import { RecommendationsManager } from './src/services/discovery/recommendations-manager';
import { TwitchService } from './src/services/twitch/service';

async function main() {
    const pool = new Pool({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
    });

    process.env.TWITCH_CLIENT_ID = 'dummy';
    process.env.TWITCH_CLIENT_SECRET = 'dummy';
    const twitchService = TwitchService.getInstance();
    const RM = new RecommendationsManager(pool, twitchService);

    const prefs: any = {
        min_viewers: 100,
        max_viewers: 50000,
        preferred_languages: ['en'],
        tags: undefined,
        confidence_threshold: 0.7
    };

    console.log("Testing filters with:", prefs);
    try {
        const recs = await RM.getChannelRecommendations('1', prefs);
        console.log(`Found ${recs.length} recommendations`);
    } catch (error) {
        console.error("Crash:", error);
    } finally {
        pool.end();
    }
}

main();
