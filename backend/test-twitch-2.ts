import { TwitchAPIClient } from './src/services/twitch/api-client';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = TwitchAPIClient.getInstance();
    const streams = await client.getTopStreams({ limit: 5 });
    console.log('Total streams:', streams.length);
    console.log('Top stream games:', streams.map(s => s.game_name));
}
run().catch(console.error);
