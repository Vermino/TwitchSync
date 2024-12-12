import { Pool } from 'pg';
import path from 'path';
import { spawn } from 'child_process';
import { logger } from '../../utils/logger';

interface Chapter {
  game_id: string | null;
  title: string;
  start_time: number;
  end_time: number;
}

interface GameSegment {
  gameId: string;
  startTime: number;
  endTime: number;
  duration: number;
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

      // Get VOD information including file path
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

      // Record analysis start
      await client.query(
        `INSERT INTO vod_processing_history (
          vod_id, status, started_at
        ) VALUES ($1, 'analyzing', CURRENT_TIMESTAMP)`,
        [vodId]
      );

      // Get video duration using ffprobe
      const duration = await this.getVideoDuration(vod.file_path);

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
        duration
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

      // Update VOD duration
      await client.query(
        'UPDATE vods SET duration_seconds = $1 WHERE id = $2',
        [duration, vodId]
      );

      // Record successful analysis
      await client.query(
        `UPDATE vod_processing_history 
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP 
         WHERE vod_id = $1 AND completed_at IS NULL`,
        [vodId]
      );

      await client.query('COMMIT');
      logger.info(`Successfully analyzed VOD ${vodId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error analyzing VOD ${vodId}:`, error);

      // Record failed analysis
      await client.query(
        `INSERT INTO vod_processing_history (
          vod_id, status, error_message, started_at, completed_at
        ) VALUES ($1, 'failed', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [vodId, error.message]
      );

      throw error;
    } finally {
      client.release();
    }
  }

  private async getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);

      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        logger.error(`ffprobe error: ${data}`);
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          resolve(Math.floor(parseFloat(output.trim())));
        } else {
          reject(new Error(`ffprobe process exited with code ${code}`));
        }
      });
    });
  }

  async extractGameSegment(
    vodId: number,
    chapterId: number,
    outputPath: string
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Get chapter and VOD information
      const result = await client.query(
        `SELECT v.file_path, c.start_time, c.end_time, c.game_id
         FROM vod_chapters c
         JOIN vods v ON c.vod_id = v.id
         WHERE c.id = $1 AND v.id = $2`,
        [chapterId, vodId]
      );

      if (result.rows.length === 0) {
        throw new Error('Chapter not found');
      }

      const { file_path, start_time, end_time, game_id } = result.rows[0];
      const duration = end_time - start_time;

      // Extract segment using ffmpeg
      await this.extractSegment(
        file_path,
        outputPath,
        start_time,
        duration
      );

      // Record extraction in database
      await client.query(
        `INSERT INTO vod_segments (
          vod_id, chapter_id, game_id, file_path,
          start_time, duration, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [vodId, chapterId, game_id, outputPath, start_time, duration]
      );

    } catch (error) {
      logger.error('Error extracting game segment:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async extractSegment(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-c', 'copy',
        outputPath
      ]);

      ffmpeg.stderr.on('data', (data) => {
        logger.debug(`ffmpeg: ${data}`);
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg process exited with code ${code}`));
        }
      });
    });
  }

  private createChaptersFromGameChanges(
    gameChanges: any[],
    vodStart: Date,
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

  private getTimeDifferenceInSeconds(start: Date, end: Date): number {
    return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  }
}

export const vodAnalyzer = (pool: Pool) => VODAnalyzer.getInstance(pool);
export default vodAnalyzer;
