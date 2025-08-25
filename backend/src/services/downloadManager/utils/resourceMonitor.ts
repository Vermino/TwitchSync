// Filepath: backend/src/services/downloadManager/utils/resourceMonitor.ts

import os from 'os';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { logger } from '../../../utils/logger';
import {
  SystemResources,
  ResourceWarning,
  ResourceCritical,
  ResourceThresholds
} from '../types';

export class ResourceMonitor extends EventEmitter {
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(
    private tempDir: string,
    private thresholds: ResourceThresholds = {
      maxMemoryUsage: 0.9, // 90%
      minDiskSpace: 10 * 1024 * 1024 * 1024, // 10GB
      maxCpuUsage: 0.8 // 80%
    }
  ) {
    super();
  }

  async getSystemResources(): Promise<SystemResources> {
    const memInfo = {
      total: os.totalmem(),
      free: os.freemem(),
      processUsage: process.memoryUsage().heapUsed
    };

    const diskInfo = await this.getDiskInfo();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();

    return {
      memoryUsage: memInfo,
      diskSpace: diskInfo,
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / (os.cpus().length * 1000000),
        loadAverage: loadAvg
      }
    };
  }

  private async getDiskInfo(): Promise<{ total: number; free: number; available: number }> {
    try {
      // For compatibility with both Windows and Unix systems
      if (process.platform === 'win32') {
        const { execFile } = require('child_process');
        const { promisify } = require('util');
        const execFileAsync = promisify(execFile);

        try {
          // Try wmic first
          const { stdout } = await execFileAsync('wmic', ['logicaldisk', 'get', 'size,freespace']);
          const lines = stdout.trim().split('\n');
          const values = lines[1].trim().split(/\s+/);

          return {
            total: parseInt(values[1]),
            free: parseInt(values[0]),
            available: parseInt(values[0])
          };
        } catch (wmicError) {
          // Fall back to PowerShell if wmic is not available
          const { stdout } = await execFileAsync('powershell', [
            '-Command',
            'Get-WmiObject -Class Win32_LogicalDisk | Select-Object Size,FreeSpace | ConvertTo-Json'
          ]);
          
          const diskData = JSON.parse(stdout);
          const disk = Array.isArray(diskData) ? diskData[0] : diskData;
          
          return {
            total: disk.Size,
            free: disk.FreeSpace,
            available: disk.FreeSpace
          };
        }
      } else {
        // Unix-like systems - use statvfs via child_process
        const { execFile } = require('child_process');
        const { promisify } = require('util');
        const execFileAsync = promisify(execFile);

        try {
          const { stdout } = await execFileAsync('df', ['-B1', this.tempDir]);
          const lines = stdout.trim().split('\n');
          if (lines.length >= 2) {
            const values = lines[1].trim().split(/\s+/);
            const total = parseInt(values[1]);
            const available = parseInt(values[3]);
            return {
              total,
              free: available,
              available
            };
          }
        } catch (dfError) {
          logger.warn('df command failed, using fallback disk space detection');
        }

        // Fallback for systems where df isn't available
        return {
          total: 1024 * 1024 * 1024 * 100, // 100GB default
          free: 1024 * 1024 * 1024 * 50,   // 50GB default
          available: 1024 * 1024 * 1024 * 50
        };
      }
    } catch (error) {
      logger.error('Error getting disk info:', error);
      throw error;
    }
  }

  checkResourceThresholds(resources: SystemResources): void {
    // Memory check
    const memoryUsage = 1 - (resources.memoryUsage.free / resources.memoryUsage.total);
    if (memoryUsage > this.thresholds.maxMemoryUsage) {
      const warning: ResourceWarning = {
        type: 'memory',
        current: memoryUsage,
        threshold: this.thresholds.maxMemoryUsage,
        message: `High memory usage: ${(memoryUsage * 100).toFixed(2)}%`
      };
      this.emit('warning', warning);

      if (memoryUsage > this.thresholds.maxMemoryUsage + 0.1) {
        const critical: ResourceCritical = {
          ...warning,
          action: 'pause',
          message: `Critical memory usage: ${(memoryUsage * 100).toFixed(2)}%`
        };
        this.emit('critical', critical);
      }
    }

    // Disk space check
    if (resources.diskSpace.available < this.thresholds.minDiskSpace) {
      const warning: ResourceWarning = {
        type: 'disk',
        current: resources.diskSpace.available,
        threshold: this.thresholds.minDiskSpace,
        message: `Low disk space: ${(resources.diskSpace.available / 1024 / 1024 / 1024).toFixed(2)}GB available`
      };
      this.emit('warning', warning);

      if (resources.diskSpace.available < this.thresholds.minDiskSpace / 2) {
        const critical: ResourceCritical = {
          ...warning,
          action: 'shutdown',
          message: `Critical disk space: ${(resources.diskSpace.available / 1024 / 1024 / 1024).toFixed(2)}GB available`
        };
        this.emit('critical', critical);
      }
    }

    // CPU check
    if (resources.cpu.usage > this.thresholds.maxCpuUsage) {
      const warning: ResourceWarning = {
        type: 'cpu',
        current: resources.cpu.usage,
        threshold: this.thresholds.maxCpuUsage,
        message: `High CPU usage: ${(resources.cpu.usage * 100).toFixed(2)}%`
      };
      this.emit('warning', warning);
    }
  }

  startMonitoring(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      try {
        const resources = await this.getSystemResources();
        this.checkResourceThresholds(resources);
      } catch (error) {
        logger.error('Error monitoring resources:', error);
      }
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
