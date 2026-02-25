// Filepath: backend/src/services/discovery/discovery-indexer.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { TwitchService } from '../twitch/service';

/**
 * DiscoveryIndexer populates the local DB with channel-game relationships.
 * 
 * Strategy:
 * 1. Use the games table to get tracked game twitch IDs
 * 2. Use Twitch API getTopVODs({gameId}) to discover channels for those games
 * 3. Save discovered channels + game stats to local DB
 * 4. For discovered channels, also fetch their VODs to find MORE games
 * 5. RecommendationsManager then queries local DB only
 */
export class DiscoveryIndexer {
    private static instance: DiscoveryIndexer;

    private constructor(
        private pool: Pool,
        private twitchAPI: TwitchService
    ) { }

    static getInstance(pool: Pool): DiscoveryIndexer {
        if (!DiscoveryIndexer.instance) {
            DiscoveryIndexer.instance = new DiscoveryIndexer(pool, TwitchService.getInstance());
        }
        return DiscoveryIndexer.instance;
    }

    /**
     * Index a channel by finding its games and discovering related channels.
     */
    async indexChannel(channelDbId: number, twitchId: string): Promise<void> {
        logger.info(`[DiscoveryIndexer] Starting index for channel ${twitchId} (DB id: ${channelDbId})`);
        const client = await this.pool.connect();

        try {
            // Step 1: Get ALL games from the games table (tracked games)
            const gamesResult = await client.query(
                'SELECT id, twitch_game_id, name FROM games WHERE is_active = true'
            );

            if (gamesResult.rows.length === 0) {
                logger.info('[DiscoveryIndexer] No games in DB to index from');
                return;
            }

            logger.info(`[DiscoveryIndexer] Found ${gamesResult.rows.length} tracked games`);

            // Step 2: Link this channel to each tracked game in channel_game_stats
            // (We know the user added this channel because they care about these games)
            for (const game of gamesResult.rows) {
                await client.query(`
          INSERT INTO channel_game_stats (channel_id, game_id, total_streams, avg_viewers, peak_viewers, last_played, first_played, updated_at)
          VALUES ($1, $2, 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (channel_id, game_id) DO NOTHING
        `, [channelDbId, game.id]);
            }

            // Step 3: For each tracked game, discover other channels via Twitch API
            for (const game of gamesResult.rows) {
                await this.discoverChannelsForGame(game.twitch_game_id, game.id, client);
            }

            // Step 4: For discovered channels, fetch their VODs to find MORE games
            const discoveredChannels = await client.query(`
        SELECT id, twitch_id FROM channels WHERE is_active = false
        ORDER BY created_at DESC LIMIT 30
      `);

            const newGameIds = new Set<string>();
            for (const ch of discoveredChannels.rows) {
                try {
                    const vods = await this.twitchAPI.getTopVODs({
                        userId: ch.twitch_id,
                        period: 'month',
                        limit: 10
                    });
                    for (const vod of vods) {
                        if (vod.game_id && !gamesResult.rows.find(g => g.twitch_game_id === vod.game_id)) {
                            newGameIds.add(vod.game_id);
                        }
                    }
                } catch {
                    // Rate limited or error, skip
                }
            }

            // Step 5: Add newly discovered games to DB and link to channels
            for (const twitchGameId of Array.from(newGameIds).slice(0, 10)) {
                await this.ensureGameExists(twitchGameId, client);
            }

            logger.info(`[DiscoveryIndexer] Discovered ${newGameIds.size} new games. Completed index for channel ${twitchId}`);
        } catch (error) {
            logger.error(`[DiscoveryIndexer] Error indexing channel ${twitchId}:`, error);
        } finally {
            client.release();
        }
    }

    /**
     * Start background indexing for a newly tracked game.
     */
    public async indexGame(twitchGameId: string, gameDbId: number): Promise<void> {
        const client = await this.pool.connect();
        try {
            logger.info(`[DiscoveryIndexer] Starting background index for manually tracked game ${twitchGameId}`);

            // Discover channels that play this game
            await this.discoverChannelsForGame(twitchGameId, gameDbId, client);

            logger.info(`[DiscoveryIndexer] Completed index for tracking game ${twitchGameId}`);
        } catch (error) {
            logger.error(`[DiscoveryIndexer] Error indexing newly tracked game ${twitchGameId}:`, error);
        } finally {
            client.release();
        }
    }

    /**
     * Discover channels for a specific game and populate channel_game_stats.
     */
    private async discoverChannelsForGame(twitchGameId: string, gameDbId: number, client: any): Promise<void> {
        try {
            const vods = await this.twitchAPI.getTopVODs({
                gameId: twitchGameId,
                period: 'month',
                sort: 'views',
                limit: 30
            });

            logger.info(`[DiscoveryIndexer] Got ${vods.length} VODs for game ${twitchGameId}`);

            let discoveredCount = 0;

            for (const vod of vods) {
                if (!vod.user_id || !vod.user_name) continue;

                // Check if channel already exists
                let channelResult = await client.query(
                    'SELECT id FROM channels WHERE twitch_id = $1',
                    [vod.user_id]
                );

                let channelDbId: number;
                if (channelResult.rows.length === 0) {
                    let profileImageUrl = null;
                    try {
                        const info = await this.twitchAPI.getChannelInfo(vod.user_name);
                        if (info && info.profile_image_url) {
                            profileImageUrl = info.profile_image_url;
                        }
                    } catch (e) {
                        // ignore
                    }

                    const insertResult = await client.query(`
            INSERT INTO channels (twitch_id, username, display_name, profile_image_url, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id
          `, [vod.user_id, vod.user_name.toLowerCase(), vod.user_name, profileImageUrl]);
                    channelDbId = insertResult.rows[0].id;
                    discoveredCount++;
                } else {
                    channelDbId = channelResult.rows[0].id;
                }

                // Upsert channel_game_stats
                await client.query(`
          INSERT INTO channel_game_stats (channel_id, game_id, total_streams, avg_viewers, peak_viewers, last_played, first_played, updated_at)
          VALUES ($1, $2, 1, $3, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (channel_id, game_id) DO UPDATE SET
            total_streams = channel_game_stats.total_streams + 1,
            avg_viewers = GREATEST(channel_game_stats.avg_viewers, EXCLUDED.avg_viewers),
            peak_viewers = GREATEST(channel_game_stats.peak_viewers, EXCLUDED.peak_viewers),
            updated_at = CURRENT_TIMESTAMP
        `, [channelDbId, gameDbId, vod.view_count || 0]);
            }

            logger.info(`[DiscoveryIndexer] Discovered ${discoveredCount} new channels for game ${twitchGameId}`);
        } catch (e) {
            logger.warn(`[DiscoveryIndexer] Error discovering channels for game ${twitchGameId}:`, e);
        }
    }

    /**
     * Ensure a game exists in the games table.
     */
    private async ensureGameExists(twitchGameId: string, client: any): Promise<void> {
        const existing = await client.query(
            'SELECT id FROM games WHERE twitch_game_id = $1',
            [twitchGameId]
        );
        if (existing.rows.length > 0) return;

        try {
            const game = await this.twitchAPI.getGameById(twitchGameId);
            if (!game) return;

            await client.query(`
        INSERT INTO games (twitch_game_id, name, box_art_url, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `, [twitchGameId, game.name, game.box_art_url || '']);

            logger.info(`[DiscoveryIndexer] Added game: ${game.name} (${twitchGameId})`);
        } catch (e) {
            logger.warn(`[DiscoveryIndexer] Could not fetch game ${twitchGameId}`);
        }
    }

    /**
     * Index all currently tracked channels.
     */
    async indexAllTrackedChannels(): Promise<void> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT id, twitch_id FROM channels WHERE is_active = true'
            );
            logger.info(`[DiscoveryIndexer] Indexing ${result.rows.length} tracked channels`);

            for (const channel of result.rows) {
                await this.indexChannel(channel.id, channel.twitch_id);
            }

            logger.info(`[DiscoveryIndexer] Finished indexing all tracked channels`);
        } finally {
            client.release();
        }
    }
}

export default DiscoveryIndexer;
