import { Pool } from 'pg';
import { twitchClient } from '../twitch/client';
import { logger } from '../../utils/logger';

interface Chapter {
  game_id: string | null;
  title: string;
  start_time: number;
  end_time: number;
}

class VODAnalyzer {
  private pool: Pool;
  private static instance: VODAnalyzer;

  private constructor(pool: Pool) {
    this.pool = pool;
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
      const chapters = this.createChaptersFromGameChanges(
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
    const hours = duration.match(/(\d+)h/)?.[1] ?? '0';
    const minutes = duration.match(/(\d+)m/)?.[1] ?? '0';
    const seconds = duration.match(/(\d+)s/)?.[1] ?? '0';

    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
  }

  private getTimeDifferenceInSeconds(start: Date, end: Date): number {
    return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  }
}

export const vodAnalyzer = (pool: Pool) => VODAnalyzer.getInstance(pool);
export default vodAnalyzer;
