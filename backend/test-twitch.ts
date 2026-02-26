import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const tokenRes = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            grant_type: 'client_credentials'
        }
    });
    const token = tokenRes.data.access_token;

    const res = await axios.get('https://api.twitch.tv/helix/videos?user_id=23460970&first=3', {
        headers: {
            'Client-Id': process.env.TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`
        }
    });

    for (const vod of res.data.data) {
        console.log('---');
        console.log('title:', vod.title);
        console.log('type:', vod.type);
        console.log('game_id:', vod.game_id);
        console.log('game_name:', vod.game_name);
        console.log('all keys:', Object.keys(vod).join(', '));
    }
}
run().catch(console.error);
