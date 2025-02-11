// Filepath: frontend/src/utils/duration.ts

export function formatDuration(durationObj: { minutes: number; seconds: number }): string {
  const { minutes, seconds } = durationObj;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

export function parseDuration(duration: string | null | undefined): { minutes: number; seconds: number } {
  // Return default if duration is not valid
  if (!duration || typeof duration !== 'string') {
    return { minutes: 0, seconds: 0 };
  }

  // Handle duration formats:
  // "1h2m3s" format
  // "1:02:03" format
  // "62m3s" format
  // "3600s" format

  try {
    // Try "1h2m3s" format first
    const hours = (duration.match(/(\d+)h/) || [0, 0])[1];
    const minutes = (duration.match(/(\d+)m/) || [0, 0])[1];
    const seconds = (duration.match(/(\d+)s/) || [0, 0])[1];

    if (hours !== '0' || minutes !== '0' || seconds !== '0') {
      return {
        minutes: parseInt(hours) * 60 + parseInt(minutes),
        seconds: parseInt(seconds)
      };
    }

    // Try "HH:MM:SS" format
    if (duration.includes(':')) {
      const parts = duration.split(':').map(part => parseInt(part));
      if (parts.length === 3) {
        return {
          minutes: parts[0] * 60 + parts[1],
          seconds: parts[2]
        };
      }
      if (parts.length === 2) {
        return {
          minutes: parts[0],
          seconds: parts[1]
        };
      }
    }

    // Try pure seconds format
    if (duration.match(/^\d+$/)) {
      const totalSeconds = parseInt(duration);
      return {
        minutes: Math.floor(totalSeconds / 60),
        seconds: totalSeconds % 60
      };
    }

    // If no format matches, return default
    return { minutes: 0, seconds: 0 };
  } catch (error) {
    console.error('Error parsing duration:', error);
    return { minutes: 0, seconds: 0 };
  }
}

export function formatDurationString(duration: string | null | undefined): string {
  if (!duration) return '0m 0s';
  return formatDuration(parseDuration(duration));
}

// Helper to validate duration format
export function isValidDuration(duration: string | null | undefined): boolean {
  if (!duration || typeof duration !== 'string') return false;

  // Check all supported formats
  const hasTimeUnits = /^\d+h|\d+m|\d+s/.test(duration);
  const isTimeFormat = /^\d{1,2}:\d{2}(:\d{2})?$/.test(duration);
  const isSeconds = /^\d+$/.test(duration);

  return hasTimeUnits || isTimeFormat || isSeconds;
}
