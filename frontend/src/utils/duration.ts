// Filepath: frontend/src/utils/duration.ts

const HOUR_IN_MINUTES = 60;

function parseTimeComponent(time: string, unit: string): number {
  const match = time.match(new RegExp(`(\\d+)${unit}`));
  return match ? parseInt(match[1], 10) : 0;
}

export function parseDuration(duration: string | null | undefined): { minutes: number; seconds: number } {
  if (!duration || typeof duration !== 'string') {
    return { minutes: 0, seconds: 0 };
  }

  try {
    // Handle Twitch duration format: "6h26m14s" or "26m14s" or "14s"
    if (duration.includes('h') || duration.includes('m') || duration.includes('s')) {
      const hours = parseTimeComponent(duration, 'h');
      const minutes = parseTimeComponent(duration, 'm');
      const seconds = parseTimeComponent(duration, 's');

      return {
        minutes: hours * HOUR_IN_MINUTES + minutes,
        seconds: seconds
      };
    }

    // Handle colon format: "6:26:14" or "26:14" or "14"
    const parts = duration.split(':').map(part => parseInt(part, 10));
    if (parts.length === 3) {
      // Hours:Minutes:Seconds
      return {
        minutes: parts[0] * HOUR_IN_MINUTES + parts[1],
        seconds: parts[2]
      };
    } else if (parts.length === 2) {
      // Minutes:Seconds
      return {
        minutes: parts[0],
        seconds: parts[1]
      };
    } else if (parts.length === 1 && !isNaN(parts[0])) {
      // Just seconds
      return {
        minutes: Math.floor(parts[0] / 60),
        seconds: parts[0] % 60
      };
    }

    // If no pattern matches, return zero duration
    return { minutes: 0, seconds: 0 };
  } catch (error) {
    console.error('Error parsing duration:', error);
    return { minutes: 0, seconds: 0 };
  }
}

export function formatDuration(durationObj: { minutes: number; seconds: number }): string {
  try {
    const { minutes, seconds } = durationObj;

    if (minutes >= HOUR_IN_MINUTES) {
      const hours = Math.floor(minutes / HOUR_IN_MINUTES);
      const remainingMinutes = minutes % HOUR_IN_MINUTES;
      return `${hours}h ${remainingMinutes}m ${seconds}s`;
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
  } catch (error) {
    console.error('Error formatting duration:', error);
    return 'Unknown duration';
  }
}

export function formatDurationString(duration: string | null | undefined): string {
  if (!duration) return 'Unknown duration';

  try {
    const parsed = parseDuration(duration);
    return formatDuration(parsed);
  } catch (error) {
    console.error('Error in formatDurationString:', error);
    return 'Unknown duration';
  }
}

export function isValidDuration(duration: string | null | undefined): boolean {
  if (!duration || typeof duration !== 'string') return false;

  // Check various valid formats
  const validPatterns = [
    /^\d+h\d+m\d+s$/, // 1h2m3s
    /^\d+m\d+s$/,     // 2m3s
    /^\d+s$/,         // 3s
    /^\d+:\d+:\d+$/,  // 1:02:03
    /^\d+:\d+$/,      // 02:03
    /^\d+$/           // 123 (seconds)
  ];

  return validPatterns.some(pattern => pattern.test(duration));
}
