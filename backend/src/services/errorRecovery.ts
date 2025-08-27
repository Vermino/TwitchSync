// Filepath: backend/src/services/errorRecovery.ts

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  jitter: boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number; // milliseconds
  monitoringWindow: number; // milliseconds
}

export interface ErrorPattern {
  type: string;
  message: string;
  count: number;
  lastOccurrence: Date;
  retryConfig?: RetryConfig;
}

export type ErrorCategory = 
  | 'network_timeout'
  | 'api_rate_limit'
  | 'authentication_error'
  | 'file_system_error'
  | 'database_error'
  | 'twitch_api_error'
  | 'unknown_error';

export class ErrorRecoveryService extends EventEmitter {
  private pool: Pool;
  private retryConfigs: Map<ErrorCategory, RetryConfig> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  private gracefulDegradation: Map<string, boolean> = new Map();

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.initializeRetryConfigs();
  }

  /**
   * Initialize default retry configurations for different error types
   */
  private initializeRetryConfigs(): void {
    // Network timeout errors - aggressive retry
    this.retryConfigs.set('network_timeout', {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true
    });

    // API rate limit - respectful retry with longer delays
    this.retryConfigs.set('api_rate_limit', {
      maxRetries: 10,
      baseDelay: 5000,
      maxDelay: 300000, // 5 minutes
      backoffMultiplier: 1.5,
      jitter: true
    });

    // Authentication errors - limited retry
    this.retryConfigs.set('authentication_error', {
      maxRetries: 2,
      baseDelay: 2000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: false
    });

    // File system errors - moderate retry
    this.retryConfigs.set('file_system_error', {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 15000,
      backoffMultiplier: 2,
      jitter: true
    });

    // Database errors - careful retry
    this.retryConfigs.set('database_error', {
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 20000,
      backoffMultiplier: 2,
      jitter: true
    });

    // Twitch API errors - API-specific retry
    this.retryConfigs.set('twitch_api_error', {
      maxRetries: 5,
      baseDelay: 2000,
      maxDelay: 60000,
      backoffMultiplier: 1.8,
      jitter: true
    });

    // Unknown errors - conservative retry
    this.retryConfigs.set('unknown_error', {
      maxRetries: 2,
      baseDelay: 5000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true
    });
  }

  /**
   * Execute function with retry logic based on error type
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    // Use circuit breaker if available
    if (this.circuitBreakers.has(operationId)) {
      const breaker = this.circuitBreakers.get(operationId)!;
      if (breaker.state === 'open') {
        if (Date.now() - breaker.lastFailureTime < breaker.config.resetTimeout) {
          throw new Error(`Circuit breaker is open for operation: ${operationId}`);
        } else {
          // Half-open state - try once
          breaker.state = 'half-open';
        }
      }
    }

    for (let attempt = 0; attempt <= (customConfig?.maxRetries || 3); attempt++) {
      try {
        const result = await operation();
        
        // Reset circuit breaker on success
        this.resetCircuitBreaker(operationId);
        
        // Log successful retry
        if (attempt > 0) {
          logger.info(`Operation ${operationId} succeeded after ${attempt} retries`);
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Record error pattern
        this.recordErrorPattern(operationId, lastError);
        
        // Update circuit breaker
        this.updateCircuitBreaker(operationId, lastError);
        
        // Check if we should retry
        if (attempt === (customConfig?.maxRetries || 3)) {
          logger.error(`Operation ${operationId} failed after ${attempt + 1} attempts:`, lastError);
          break;
        }

        // Determine error category and get retry config
        const errorCategory = this.categorizeError(lastError);
        const retryConfig = this.getRetryConfig(errorCategory, customConfig);
        
        // Calculate delay
        const delay = this.calculateDelay(attempt, retryConfig);
        
        logger.warn(`Operation ${operationId} failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, lastError.message);
        
        // Wait before retry
        await this.delay(delay);
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error(`Operation ${operationId} failed after all retries`);
  }

  /**
   * Categorize error to determine appropriate retry strategy
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    
    // Network/timeout errors
    if (message.includes('timeout') || message.includes('network') || message.includes('econnreset')) {
      return 'network_timeout';
    }
    
    // Rate limiting
    if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
      return 'api_rate_limit';
    }
    
    // Authentication
    if (message.includes('unauthorized') || message.includes('401') || message.includes('forbidden') || message.includes('403')) {
      return 'authentication_error';
    }
    
    // File system
    if (message.includes('enoent') || message.includes('eacces') || message.includes('emfile')) {
      return 'file_system_error';
    }
    
    // Database
    if (message.includes('database') || message.includes('connection') || message.includes('pool')) {
      return 'database_error';
    }
    
    // Twitch API specific
    if (message.includes('twitch') || message.includes('helix')) {
      return 'twitch_api_error';
    }
    
    return 'unknown_error';
  }

  /**
   * Get retry configuration for error category
   */
  private getRetryConfig(category: ErrorCategory, customConfig?: Partial<RetryConfig>): RetryConfig {
    const baseConfig = this.retryConfigs.get(category) || this.retryConfigs.get('unknown_error')!;
    return { ...baseConfig, ...customConfig };
  }

  /**
   * Calculate delay for retry attempt with exponential backoff
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
    
    // Apply maximum delay
    delay = Math.min(delay, config.maxDelay);
    
    // Apply jitter to prevent thundering herd
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  /**
   * Simple delay function
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Record error patterns for analysis
   */
  public recordErrorPattern(operationId: string, error: Error): void {
    const key = `${operationId}:${error.constructor.name}`;
    const existing = this.errorPatterns.get(key);
    
    if (existing) {
      existing.count++;
      existing.lastOccurrence = new Date();
    } else {
      this.errorPatterns.set(key, {
        type: error.constructor.name,
        message: error.message,
        count: 1,
        lastOccurrence: new Date()
      });
    }

    // Emit error pattern event for monitoring
    this.emit('error:pattern', { operationId, error, pattern: this.errorPatterns.get(key) });
  }

  /**
   * Update circuit breaker state based on error
   */
  private updateCircuitBreaker(operationId: string, error: Error): void {
    let breaker = this.circuitBreakers.get(operationId);
    
    if (!breaker) {
      breaker = {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        config: {
          failureThreshold: 5,
          resetTimeout: 60000, // 1 minute
          monitoringWindow: 120000 // 2 minutes
        }
      };
      this.circuitBreakers.set(operationId, breaker);
    }

    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();

    // Open circuit breaker if threshold exceeded
    if (breaker.failureCount >= breaker.config.failureThreshold) {
      breaker.state = 'open';
      logger.warn(`Circuit breaker opened for operation: ${operationId}`);
      this.emit('circuit:opened', { operationId, error });
    }
  }

  /**
   * Reset circuit breaker on successful operation
   */
  private resetCircuitBreaker(operationId: string): void {
    const breaker = this.circuitBreakers.get(operationId);
    if (breaker && breaker.state !== 'closed') {
      breaker.state = 'closed';
      breaker.failureCount = 0;
      logger.info(`Circuit breaker reset for operation: ${operationId}`);
      this.emit('circuit:reset', { operationId });
    }
  }

  /**
   * Enable graceful degradation for a service
   */
  public enableGracefulDegradation(serviceName: string): void {
    this.gracefulDegradation.set(serviceName, true);
    logger.info(`Graceful degradation enabled for service: ${serviceName}`);
    this.emit('degradation:enabled', { serviceName });
  }

  /**
   * Disable graceful degradation for a service
   */
  public disableGracefulDegradation(serviceName: string): void {
    this.gracefulDegradation.set(serviceName, false);
    logger.info(`Graceful degradation disabled for service: ${serviceName}`);
    this.emit('degradation:disabled', { serviceName });
  }

  /**
   * Check if graceful degradation is enabled for a service
   */
  public isGracefulDegradationEnabled(serviceName: string): boolean {
    return this.gracefulDegradation.get(serviceName) || false;
  }

  /**
   * Execute operation with graceful degradation fallback
   */
  public async executeWithGracefulDegradation<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    serviceName: string,
    operationId: string
  ): Promise<T> {
    try {
      return await this.executeWithRetry(operation, operationId);
    } catch (error) {
      if (this.isGracefulDegradationEnabled(serviceName)) {
        logger.warn(`Primary operation failed, using fallback for ${serviceName}:`, error);
        return await fallback();
      } else {
        throw error;
      }
    }
  }

  /**
   * Get error statistics for monitoring
   */
  public getErrorStats(): {
    patterns: Array<{ operationId: string; pattern: ErrorPattern }>;
    circuitBreakers: Array<{ operationId: string; state: CircuitBreakerState }>;
    degradedServices: string[];
  } {
    const patterns = Array.from(this.errorPatterns.entries()).map(([key, pattern]) => ({
      operationId: key.split(':')[0],
      pattern
    }));

    const circuitBreakers = Array.from(this.circuitBreakers.entries()).map(([operationId, state]) => ({
      operationId,
      state
    }));

    const degradedServices = Array.from(this.gracefulDegradation.entries())
      .filter(([, enabled]) => enabled)
      .map(([serviceName]) => serviceName);

    return { patterns, circuitBreakers, degradedServices };
  }

  /**
   * Clear error patterns and reset circuit breakers
   */
  public clearErrorHistory(): void {
    this.errorPatterns.clear();
    this.circuitBreakers.clear();
    this.gracefulDegradation.clear();
    logger.info('Error recovery state cleared');
  }

  /**
   * Update retry configuration for a specific error category
   */
  public updateRetryConfig(category: ErrorCategory, config: Partial<RetryConfig>): void {
    const existing = this.retryConfigs.get(category) || this.retryConfigs.get('unknown_error')!;
    this.retryConfigs.set(category, { ...existing, ...config });
    logger.info(`Updated retry config for ${category}:`, config);
  }
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  config: CircuitBreakerConfig;
}

export const createErrorRecoveryService = (pool: Pool) => new ErrorRecoveryService(pool);