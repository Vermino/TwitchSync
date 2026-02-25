import { TwitchAPIClient } from './src/services/twitch/api-client';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = TwitchAPIClient.getInstance();
    const streams = await client.getTopStreams({ gameId: ['1519193002'] });
    console.log('Total streams:', streams.length);
    console.log('Viewer counts:', streams.map(s => s.viewer_count));
}
run().catch(console.error);
