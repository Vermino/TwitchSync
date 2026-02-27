import * as dotenv from 'dotenv';
dotenv.config();

import TwitchService from './src/services/twitch/service';

async function main() {
    console.log('Testing getTopVODs for a game ID');
    try {
        const vods = await TwitchService.getTopVODs({
            gameId: '1519193002', // Slice & Dice
            limit: 30,
            period: 'month',
            sort: 'views'
        });
        console.log(`Successfully fetched ${vods.length} VODs!`, vods.slice(0, 2));
    } catch (err: any) {
        console.error('Failed to fetch:', err.message);
    }
}

main().catch(console.error);
