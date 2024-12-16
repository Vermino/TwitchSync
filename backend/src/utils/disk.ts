// Filepath: backend/src/utils/disk.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import path from 'path';

const execAsync = promisify(exec);

interface DiskStats {
  total: number;
  free: number;
  used: number;
}

export async function diskUsage(dirPath: string): Promise<DiskStats> {
  try {
    if (os.platform() === 'win32') {
      // Windows implementation
      const drive = path.parse(dirPath).root;
      const { stdout } = await execAsync(`wmic logicaldisk where "DeviceID='${drive.replace('\\', '')}'" get size,freespace /format:value`);

      const lines = stdout.trim().split('\n');
      const values: { [key: string]: string } = {};

      lines.forEach(line => {
        const [key, value] = line.trim().split('=');
        if (key && value) {
          values[key.toLowerCase()] = value;
        }
      });

      const total = parseInt(values['size'] || '0');
      const free = parseInt(values['freespace'] || '0');

      return {
        total,
        free,
        used: total - free
      };
    } else {
      // Unix-like systems implementation
      const { stdout } = await execAsync(`df -B1 "${dirPath}"`);
      const [, line] = stdout.trim().split('\n');
      const [, total, , free] = line.trim().split(/\s+/);

      return {
        total: parseInt(total),
        free: parseInt(free),
        used: parseInt(total) - parseInt(free)
      };
    }
  } catch (error) {
    throw new Error(`Failed to get disk usage: ${error}`);
  }
}

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  const fs = await import('fs/promises');
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}
