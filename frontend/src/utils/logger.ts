// Filepath: frontend/src/utils/logger.ts

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

interface LogConfig {
  level: LogLevel;
  enableConsole: boolean;
  enablePersistence: boolean;
  maxStorageEntries?: number;
}

class Logger {
  private static instance: Logger;
  private config: LogConfig = {
    level: LogLevel.INFO,
    enableConsole: true,
    enablePersistence: true,
    maxStorageEntries: 1000
  };

  private constructor() {
    // Load config from localStorage if exists
    const savedConfig = localStorage.getItem('logger_config');
    if (savedConfig) {
      this.config = { ...this.config, ...JSON.parse(savedConfig) };
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(arg => {
      if (arg instanceof Error) {
        return {
          message: arg.message,
          stack: arg.stack,
          name: arg.name
        };
      }
      return arg;
    });

    return `[${timestamp}] [${level}] ${message} ${formattedArgs.length ? JSON.stringify(formattedArgs) : ''}`;
  }

  private persistLog(logEntry: string): void {
    if (!this.config.enablePersistence) return;

    try {
      const logs = JSON.parse(localStorage.getItem('application_logs') || '[]');
      logs.push(logEntry);

      // Maintain max entries limit
      while (logs.length > (this.config.maxStorageEntries || 1000)) {
        logs.shift();
      }

      localStorage.setItem('application_logs', JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to persist log:', error);
    }
  }

  public debug(message: string, ...args: any[]): void {
    if (this.config.level <= LogLevel.DEBUG) {
      const logEntry = this.formatMessage('DEBUG', message, ...args);
      if (this.config.enableConsole) {
        console.debug(logEntry);
      }
      this.persistLog(logEntry);
    }
  }

  public info(message: string, ...args: any[]): void {
    if (this.config.level <= LogLevel.INFO) {
      const logEntry = this.formatMessage('INFO', message, ...args);
      if (this.config.enableConsole) {
        console.info(logEntry);
      }
      this.persistLog(logEntry);
    }
  }

  public warn(message: string, ...args: any[]): void {
    if (this.config.level <= LogLevel.WARN) {
      const logEntry = this.formatMessage('WARN', message, ...args);
      if (this.config.enableConsole) {
        console.warn(logEntry);
      }
      this.persistLog(logEntry);
    }
  }

  public error(message: string, ...args: any[]): void {
    if (this.config.level <= LogLevel.ERROR) {
      const logEntry = this.formatMessage('ERROR', message, ...args);
      if (this.config.enableConsole) {
        console.error(logEntry);
      }
      this.persistLog(logEntry);
    }
  }

  public getLogs(): string[] {
    try {
      return JSON.parse(localStorage.getItem('application_logs') || '[]');
    } catch {
      return [];
    }
  }

  public clearLogs(): void {
    localStorage.removeItem('application_logs');
  }

  public setConfig(config: Partial<LogConfig>): void {
    this.config = { ...this.config, ...config };
    localStorage.setItem('logger_config', JSON.stringify(this.config));
  }
}

export const logger = Logger.getInstance();
