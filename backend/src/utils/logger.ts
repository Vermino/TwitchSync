import * as winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Always log to stdout — docker logs reads stdout/stderr
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        // JSON in production — clean for log aggregators
        ? winston.format.combine(winston.format.timestamp(), winston.format.json())
        // Colorized in dev
        : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    // File transports only in non-Docker / local dev
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.File({ filename: 'error.log', level: 'error' }),
      new winston.transports.File({ filename: 'combined.log' }),
    ] : [])
  ]
});

export default logger;

