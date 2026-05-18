// Filepath: backend/src/services/downloadManager/utils/throttle.ts

import { Transform } from 'stream';
import { logger } from '../../../utils/logger';

export class BandwidthThrottler {
  private static createThrottledStream(bytesPerSecond: number): Transform {
    let bytesSent = 0;
    let lastCheck = Date.now();

    const transform = new Transform({
      transform(chunk: Buffer, encoding: BufferEncoding, callback) {
        bytesSent += chunk.length;
        const now = Date.now();
        const timeDiff = now - lastCheck;
        const targetBytes = (bytesPerSecond * timeDiff) / 1000;

        if (bytesSent > targetBytes) {
          const waitTime = ((bytesSent - targetBytes) * 1000) / bytesPerSecond;
          setTimeout(() => {
            bytesSent = 0;
            lastCheck = Date.now();
            this.push(chunk);
            callback();
          }, waitTime);
        } else {
          this.push(chunk);
          callback();
        }
      }
    });

    return transform;
  }

  static applyThrottling(
    stream: NodeJS.ReadableStream,
    bytesPerSecond: number
  ): NodeJS.ReadableStream {
    try {
      const throttledStream = this.createThrottledStream(bytesPerSecond);
      return stream.pipe(throttledStream);
    } catch (error) {
      logger.error('Error applying bandwidth throttling:', error);
      throw error;
    }
  }

  static calculateThrottleDelay(
    bytesTransferred: number,
    targetBytesPerSecond: number,
    elapsedMs: number
  ): number {
    const targetBytes = (targetBytesPerSecond * elapsedMs) / 1000;
    if (bytesTransferred > targetBytes) {
      return ((bytesTransferred - targetBytes) * 1000) / targetBytesPerSecond;
    }
    return 0;
  }
}
