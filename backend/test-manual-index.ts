import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

import { DiscoveryIndexer } from './src/services/discovery/discovery-indexer';

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

const logFile = './indexer-output.txt';
function log(msg: string) {
    fs.appendFileSync(logFile, msg + '\n');
}

async function main() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT id, twitch_game_id, name FROM games WHERE is_active = true');
        log(`Found ${res.rows.length} tracked games.`);

        // override logger
        const originalConsoleLog = console.log;
        const originalConsoleInfo = console.info;
        const originalConsoleWarn = console.warn;
        const originalConsoleError = console.error;

        const mkLog = (prefix: string) => (...args: any[]) => {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
            log(`[${prefix}] ${msg}`);
        };

        console.log = mkLog('LOG');
        console.info = mkLog('INFO');
        console.warn = mkLog('WARN');
        console.error = mkLog('ERROR');

        const indexer = DiscoveryIndexer.getInstance(pool);
        for (const row of res.rows) {
            log(`Manually indexing game: ${row.name} (${row.twitch_game_id})`);
            await indexer.indexGame(row.twitch_game_id, row.id);
        }
    } catch (err: any) {
        log('Error during indexing: ' + err.message);
    } finally {
        client.release();
        pool.end();
    }
}

main().catch((err) => log(err.message));
