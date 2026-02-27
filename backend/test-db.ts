import { getPool } from './src/database';
import { logger } from './src/utils/logger';

async function test() {
    const pool = getPool();
    try {
        const res = await pool.query(`SELECT id, title, twitch_id, duration, game_id FROM vods LIMIT 10`);
        console.log(res.rows);
    } catch (e) {
        logger.error('Error', e);
    } finally {
        pool.end();
    }
}
test();
