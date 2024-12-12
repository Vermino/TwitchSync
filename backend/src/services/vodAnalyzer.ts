import { Pool } from 'pg';
import TwitchAPIService from './twitch';
import { logger } from '../utils/logger';

interface Chapter {
  game_id: string | null;
  title: string;
  start_time: number;
  end_time: number;
}

class VODAnalyzer {
  private pool: Pool;
  private twitchAPI: TwitchAPIService;
  private static instance: VODAnalyzer;

  private constructor(pool: Pool) {
    this.pool = pool;
    this.twitchAPI = TwitchAPIService.getInstance();
  }

  public static getInstance(pool: Pool): VODAnalyzer {
    if (!VODAnalyzer.instance) {
      VODAnalyzer.instance = new VODAnalyzer(pool);
    }
    return VODAnalyzer.instance;
  }

  async analyzeVOD(vodId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get VOD information
      const vodResult = await client.query(
        `SELECT v.*, c.twitch_id as channel_twitch_id 
         FROM vods v 
         JOIN channels c ON v.channel_id = c.id 
         WHERE v.id = $1`,
        [vodId]
      );

      if (vodResult.rows.length === 0) {
        throw new Error(`VOD ${vodId} not found`);
      }

      const vod = vodResult.rows[0];

      // Get game changes during the VOD timeframe
      const gameChanges = await client.query(
        `SELECT * FROM game_changes 
         WHERE channel_id = $1 
         AND changed_at BETWEEN $2 AND $3 
         ORDER BY changed_at`,
        [vod.channel_id, vod.created_at, vod.published_at]
      );

      // Create chapters based on game changes
      const chapters: Chapter[] = this.createChaptersFromGameChanges(
        gameChanges.rows,
        vod.created_at,
        vod.published_at,
        this.getDurationInSeconds(vod.duration)
      );

      // Store chapters
      for (const chapter of chapters) {
        await client.query(
          `INSERT INTO vod_chapters (
            vod_id, game_id, title, start_time, end_time
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            vodId,
            chapter.game_id,
            chapter.title,
            chapter.start_time,
            chapter.end_time
          ]
        );
      }

      // Queue downloads for chapters with tracked games
      const trackedGames = await client.query(
        'SELECT twitch_game_id FROM tracked_games WHERE is_active = true'
      );

      const trackedGameIds = new Set(trackedGames.rows.map(g => g.twitch_game_id));

      for (const chapter of chapters) {
        if (chapter.game_id && trackedGameIds.has(chapter.game_id)) {
          await client.query(
            `INSERT INTO download_queue (
              vod_id, chapter_id, priority, status
            ) VALUES (
              $1,
              (SELECT id FROM vod_chapters WHERE vod_id = $1 AND start_time = $2),
              1,
              'pending'
            )`,
            [vodId, chapter.start_time]
          );
        }
      }

      await client.query('COMMIT');
      logger.info(`Successfully analyzed VOD ${vodId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error analyzing VOD ${vodId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  private createChaptersFromGameChanges(
    gameChanges: any[],
    vodStart: Date,
    vodEnd: Date,
    totalDuration: number
  ): Chapter[] {
    const chapters: Chapter[] = [];
    let currentTime = 0;

    // Add initial chapter if there was a game being played at the start
    if (gameChanges.length > 0) {
      const initialGame = gameChanges[0].previous_game_id;
      if (initialGame) {
        chapters.push({
          game_id: initialGame,
          title: `Game Session: ${initialGame}`,
          start_time: 0,
          end_time: this.getTimeDifferenceInSeconds(vodStart, gameChanges[0].changed_at)
        });
        currentTime = chapters[0].end_time;
      }
    }

    // Add chapters for each game change
    for (let i = 0; i < gameChanges.length; i++) {
      const change = gameChanges[i];
      const nextChange = gameChanges[i + 1];

      const endTime = nextChange
        ? this.getTimeDifferenceInSeconds(vodStart, nextChange.changed_at)
        : totalDuration;

      if (change.new_game_id) {
        chapters.push({
          game_id: change.new_game_id,
          title: `Game Session: ${change.new_game_id}`,
          start_time: currentTime,
          end_time: endTime
        });
      }

      currentTime = endTime;
    }

    return chapters;
  }

  private getDurationInSeconds(duration: string): number {
    // Parse Twitch duration format (e.g., "1h2m3s")
    const hours = duration.match(/(\d+)h/)?.[1] ?? '0';
    const minutes = duration.match(/(\d+)m/)?.[1] ?? '0';
    const seconds = duration.match(/(\d+)s/)?.[1] ?? '0';

    return (
      parseInt(hours) * 3600 +
      parseInt(minutes) * 60 +
      parseInt(seconds)
    );
  }

  private getTimeDifferenceInSeconds(start: Date, end: Date): number {
    return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  }

  async getVODChapters(vodId: number): Promise<Chapter[]> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM vod_chapters WHERE vod_id = $1 ORDER BY start_time',
        [vodId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error fetching chapters for VOD ${vodId}:`, error);
      throw error;
    }
  }

  async reanalyzeVOD(vodId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Delete existing chapters
      await client.query(
        'DELETE FROM vod_chapters WHERE vod_id = $1',
        [vodId]
      );

      // Delete existing download queue items
      await client.query(
        'DELETE FROM download_queue WHERE vod_id = $1',
        [vodId]
      );

      await client.query('COMMIT');

      // Run new analysis
      await this.analyzeVOD(vodId);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error reanalyzing VOD ${vodId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export default VODAnalyzer;
