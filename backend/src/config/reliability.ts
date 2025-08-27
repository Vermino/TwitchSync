// Filepath: backend/src/config/reliability.ts

/**
 * Reliability configuration and environment variables
 * 
 * This file documents all environment variables related to service reliability enhancements
 */

export interface ReliabilityEnvironmentConfig {
  // Health Monitoring
  HEALTH_MONITORING_ENABLED?: string;          // 'true'|'false' - Enable/disable health monitoring
  HEALTH_CHECK_INTERVAL?: string;              // Milliseconds between health checks (default: 30000)
  
  // Cleanup Service
  CLEANUP_ENABLED?: string;                    // 'true'|'false' - Enable/disable cleanup service
  CLEANUP_INTERVAL?: string;                   // Milliseconds between cleanup runs (default: 3600000)
  TEMP_FILE_MAX_AGE?: string;                  // Max age for temp files in ms (default: 86400000 - 24h)
  LOG_FILE_MAX_AGE?: string;                   // Max age for log files in ms (default: 604800000 - 7d)
  EMERGENCY_CLEANUP_ENABLED?: string;          // 'true'|'false' - Enable emergency cleanup
  DISK_SPACE_THRESHOLD_GB?: string;           // Disk space threshold for emergency cleanup (default: 5)
  
  // Startup Recovery
  STARTUP_RECOVERY_ENABLED?: string;          // 'true'|'false' - Enable startup recovery
  RECOVERY_MAX_AGE_HOURS?: string;            // Max age for recovery attempts (default: 24)
  
  // Error Recovery & Retry Logic
  MAX_RETRIES?: string;                       // Default max retries for operations (default: 3)
  BASE_DELAY_MS?: string;                     // Base delay for exponential backoff (default: 1000)
  MAX_DELAY_MS?: string;                      // Maximum delay between retries (default: 30000)
  CIRCUIT_BREAKER_FAILURE_THRESHOLD?: string; // Failures before circuit breaker opens (default: 5)
  CIRCUIT_BREAKER_RESET_TIMEOUT?: string;     // Time before circuit breaker reset (default: 60000)
  
  // Database Reliability
  DB_HEALTH_CHECK_TIMEOUT?: string;           // Database health check timeout (default: 5000)
  DB_CONNECTION_RETRY_ATTEMPTS?: string;      // Database connection retry attempts (default: 3)
  
  // Download Manager Reliability  
  DOWNLOAD_SEGMENT_TIMEOUT?: string;          // Timeout for segment downloads (default: 30000)
  DOWNLOAD_PLAYLIST_TIMEOUT?: string;         // Timeout for playlist requests (default: 10000)
  DOWNLOAD_FAILURE_THRESHOLD?: string;        // Failures before degradation (default: 5)
  
  // System Resource Thresholds
  MEMORY_WARNING_THRESHOLD?: string;          // Memory usage warning threshold % (default: 80)
  MEMORY_CRITICAL_THRESHOLD?: string;         // Memory usage critical threshold % (default: 90)
  DISK_WARNING_THRESHOLD_GB?: string;         // Disk space warning threshold GB (default: 10)
  DISK_CRITICAL_THRESHOLD_GB?: string;        // Disk space critical threshold GB (default: 5)
  
  // Service Degradation
  GRACEFUL_DEGRADATION_ENABLED?: string;      // 'true'|'false' - Enable graceful degradation
  DEGRADATION_RECOVERY_INTERVAL?: string;     // Interval to check for service recovery (default: 300000)
}

/**
 * Default reliability configuration values
 */
export const DEFAULT_RELIABILITY_CONFIG = {
  // Health Monitoring
  HEALTH_MONITORING_ENABLED: 'true',
  HEALTH_CHECK_INTERVAL: '30000',              // 30 seconds
  
  // Cleanup Service
  CLEANUP_ENABLED: 'true',
  CLEANUP_INTERVAL: '3600000',                 // 1 hour
  TEMP_FILE_MAX_AGE: '86400000',               // 24 hours
  LOG_FILE_MAX_AGE: '604800000',               // 7 days
  EMERGENCY_CLEANUP_ENABLED: 'true',
  DISK_SPACE_THRESHOLD_GB: '5',
  
  // Startup Recovery
  STARTUP_RECOVERY_ENABLED: 'true',
  RECOVERY_MAX_AGE_HOURS: '24',
  
  // Error Recovery
  MAX_RETRIES: '3',
  BASE_DELAY_MS: '1000',                       // 1 second
  MAX_DELAY_MS: '30000',                       // 30 seconds
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: '5',
  CIRCUIT_BREAKER_RESET_TIMEOUT: '60000',      // 1 minute
  
  // Database Reliability
  DB_HEALTH_CHECK_TIMEOUT: '5000',             // 5 seconds
  DB_CONNECTION_RETRY_ATTEMPTS: '3',
  
  // Download Manager Reliability
  DOWNLOAD_SEGMENT_TIMEOUT: '30000',           // 30 seconds
  DOWNLOAD_PLAYLIST_TIMEOUT: '10000',          // 10 seconds
  DOWNLOAD_FAILURE_THRESHOLD: '5',
  
  // System Resource Thresholds
  MEMORY_WARNING_THRESHOLD: '80',              // 80%
  MEMORY_CRITICAL_THRESHOLD: '90',             // 90%
  DISK_WARNING_THRESHOLD_GB: '10',             // 10GB
  DISK_CRITICAL_THRESHOLD_GB: '5',             // 5GB
  
  // Service Degradation
  GRACEFUL_DEGRADATION_ENABLED: 'true',
  DEGRADATION_RECOVERY_INTERVAL: '300000'      // 5 minutes
};

/**
 * Parse reliability configuration from environment
 */
export function parseReliabilityConfig(): any {
  return {
    healthMonitoring: {
      enabled: process.env.HEALTH_MONITORING_ENABLED !== 'false',
      intervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL || DEFAULT_RELIABILITY_CONFIG.HEALTH_CHECK_INTERVAL)
    },
    cleanup: {
      enabled: process.env.CLEANUP_ENABLED !== 'false',
      intervalMs: parseInt(process.env.CLEANUP_INTERVAL || DEFAULT_RELIABILITY_CONFIG.CLEANUP_INTERVAL),
      tempFileMaxAge: parseInt(process.env.TEMP_FILE_MAX_AGE || DEFAULT_RELIABILITY_CONFIG.TEMP_FILE_MAX_AGE),
      logFileMaxAge: parseInt(process.env.LOG_FILE_MAX_AGE || DEFAULT_RELIABILITY_CONFIG.LOG_FILE_MAX_AGE),
      emergencyCleanup: process.env.EMERGENCY_CLEANUP_ENABLED !== 'false',
      diskSpaceThresholdGB: parseInt(process.env.DISK_SPACE_THRESHOLD_GB || DEFAULT_RELIABILITY_CONFIG.DISK_SPACE_THRESHOLD_GB)
    },
    recovery: {
      performStartupRecovery: process.env.STARTUP_RECOVERY_ENABLED !== 'false',
      maxAgeHours: parseInt(process.env.RECOVERY_MAX_AGE_HOURS || DEFAULT_RELIABILITY_CONFIG.RECOVERY_MAX_AGE_HOURS),
      retryConfigs: {
        maxRetries: parseInt(process.env.MAX_RETRIES || DEFAULT_RELIABILITY_CONFIG.MAX_RETRIES),
        baseDelayMs: parseInt(process.env.BASE_DELAY_MS || DEFAULT_RELIABILITY_CONFIG.BASE_DELAY_MS),
        maxDelayMs: parseInt(process.env.MAX_DELAY_MS || DEFAULT_RELIABILITY_CONFIG.MAX_DELAY_MS)
      }
    },
    circuitBreaker: {
      failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || DEFAULT_RELIABILITY_CONFIG.CIRCUIT_BREAKER_FAILURE_THRESHOLD),
      resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || DEFAULT_RELIABILITY_CONFIG.CIRCUIT_BREAKER_RESET_TIMEOUT)
    },
    database: {
      healthCheckTimeout: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT || DEFAULT_RELIABILITY_CONFIG.DB_HEALTH_CHECK_TIMEOUT),
      connectionRetryAttempts: parseInt(process.env.DB_CONNECTION_RETRY_ATTEMPTS || DEFAULT_RELIABILITY_CONFIG.DB_CONNECTION_RETRY_ATTEMPTS)
    },
    download: {
      segmentTimeout: parseInt(process.env.DOWNLOAD_SEGMENT_TIMEOUT || DEFAULT_RELIABILITY_CONFIG.DOWNLOAD_SEGMENT_TIMEOUT),
      playlistTimeout: parseInt(process.env.DOWNLOAD_PLAYLIST_TIMEOUT || DEFAULT_RELIABILITY_CONFIG.DOWNLOAD_PLAYLIST_TIMEOUT),
      failureThreshold: parseInt(process.env.DOWNLOAD_FAILURE_THRESHOLD || DEFAULT_RELIABILITY_CONFIG.DOWNLOAD_FAILURE_THRESHOLD)
    },
    systemThresholds: {
      memoryWarning: parseInt(process.env.MEMORY_WARNING_THRESHOLD || DEFAULT_RELIABILITY_CONFIG.MEMORY_WARNING_THRESHOLD),
      memoryCritical: parseInt(process.env.MEMORY_CRITICAL_THRESHOLD || DEFAULT_RELIABILITY_CONFIG.MEMORY_CRITICAL_THRESHOLD),
      diskWarningGB: parseInt(process.env.DISK_WARNING_THRESHOLD_GB || DEFAULT_RELIABILITY_CONFIG.DISK_WARNING_THRESHOLD_GB),
      diskCriticalGB: parseInt(process.env.DISK_CRITICAL_THRESHOLD_GB || DEFAULT_RELIABILITY_CONFIG.DISK_CRITICAL_THRESHOLD_GB)
    },
    gracefulDegradation: {
      enabled: process.env.GRACEFUL_DEGRADATION_ENABLED !== 'false',
      recoveryInterval: parseInt(process.env.DEGRADATION_RECOVERY_INTERVAL || DEFAULT_RELIABILITY_CONFIG.DEGRADATION_RECOVERY_INTERVAL)
    }
  };
}

/**
 * Documentation for reliability environment variables
 */
export const RELIABILITY_ENV_DOCS = `
# TwitchSync Reliability Configuration

## Health Monitoring
HEALTH_MONITORING_ENABLED=true          # Enable health monitoring service
HEALTH_CHECK_INTERVAL=30000             # Health check interval in milliseconds (30s)

## Cleanup Service  
CLEANUP_ENABLED=true                    # Enable automated cleanup
CLEANUP_INTERVAL=3600000                # Cleanup interval in milliseconds (1h)
TEMP_FILE_MAX_AGE=86400000             # Max age for temp files in ms (24h)
LOG_FILE_MAX_AGE=604800000             # Max age for log files in ms (7d)
EMERGENCY_CLEANUP_ENABLED=true          # Enable emergency cleanup on low disk space
DISK_SPACE_THRESHOLD_GB=5               # Trigger emergency cleanup when free space < 5GB

## Startup Recovery
STARTUP_RECOVERY_ENABLED=true           # Perform startup recovery on server restart
RECOVERY_MAX_AGE_HOURS=24              # Only recover items modified within 24h

## Error Recovery & Retry Logic
MAX_RETRIES=3                          # Default maximum retry attempts
BASE_DELAY_MS=1000                     # Base delay for exponential backoff (1s)
MAX_DELAY_MS=30000                     # Maximum delay between retries (30s)
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5    # Failures before circuit breaker opens
CIRCUIT_BREAKER_RESET_TIMEOUT=60000    # Circuit breaker reset timeout (1m)

## Database Reliability
DB_HEALTH_CHECK_TIMEOUT=5000           # Database health check timeout (5s)
DB_CONNECTION_RETRY_ATTEMPTS=3         # Database connection retry attempts

## Download Manager Reliability
DOWNLOAD_SEGMENT_TIMEOUT=30000         # Individual segment download timeout (30s)
DOWNLOAD_PLAYLIST_TIMEOUT=10000        # Playlist request timeout (10s)
DOWNLOAD_FAILURE_THRESHOLD=5           # Failures before enabling degradation

## System Resource Thresholds
MEMORY_WARNING_THRESHOLD=80            # Memory usage warning threshold (80%)
MEMORY_CRITICAL_THRESHOLD=90           # Memory usage critical threshold (90%)
DISK_WARNING_THRESHOLD_GB=10           # Disk space warning threshold (10GB)
DISK_CRITICAL_THRESHOLD_GB=5           # Disk space critical threshold (5GB)

## Graceful Degradation
GRACEFUL_DEGRADATION_ENABLED=true      # Enable graceful service degradation
DEGRADATION_RECOVERY_INTERVAL=300000   # Service recovery check interval (5m)

## Usage Examples:

# Production settings for high reliability
HEALTH_CHECK_INTERVAL=15000            # More frequent health checks
CLEANUP_INTERVAL=1800000               # Cleanup every 30 minutes
MAX_RETRIES=5                          # More aggressive retries
CIRCUIT_BREAKER_FAILURE_THRESHOLD=3    # More sensitive circuit breaker

# Development settings for faster feedback
HEALTH_CHECK_INTERVAL=60000            # Less frequent health checks
TEMP_FILE_MAX_AGE=3600000             # Clean temp files after 1 hour
STARTUP_RECOVERY_ENABLED=false         # Disable recovery in development
`;

export default parseReliabilityConfig;