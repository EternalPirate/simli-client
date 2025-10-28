/**
 * Log levels for the Simli SDK
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Logger interface for dependency injection and testing
 */
export interface ILogger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}

/**
 * Structured logger for Simli SDK
 * 
 * Features:
 * - Log levels (DEBUG, INFO, WARN, ERROR, NONE)
 * - Structured metadata
 * - Timestamps
 * - Prefix for easy filtering
 * 
 * @example
 * ```typescript
 * const logger = new Logger('WebRTC', LogLevel.INFO);
 * logger.info('Connection established', { peerId: 'abc123' });
 * logger.error('Connection failed', { reason: 'timeout' });
 * ```
 */
export class Logger implements ILogger {
  private level: LogLevel;

  constructor(
    private readonly prefix: string = 'SIMLI',
    level: LogLevel = LogLevel.INFO
  ) {
    this.level = level;
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Log debug message (detailed information for debugging)
   */
  debug(message: string, meta?: unknown): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log('DEBUG', message, meta);
    }
  }

  /**
   * Log info message (general information)
   */
  info(message: string, meta?: unknown): void {
    if (this.level <= LogLevel.INFO) {
      this.log('INFO', message, meta);
    }
  }

  /**
   * Log warning message (something unexpected but not critical)
   */
  warn(message: string, meta?: unknown): void {
    if (this.level <= LogLevel.WARN) {
      this.log('WARN', message, meta);
    }
  }

  /**
   * Log error message (critical issues)
   */
  error(message: string, meta?: unknown): void {
    if (this.level <= LogLevel.ERROR) {
      this.log('ERROR', message, meta);
    }
  }

  /**
   * Internal log method with timestamp
   */
  private log(level: string, message: string, meta?: unknown): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${this.prefix}:${level}]`;
    const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';

    const logMessage = `${timestamp} ${prefix} ${message}${metaStr}`;

    switch (level) {
      case 'DEBUG':
        console.debug(logMessage);
        break;
      case 'INFO':
        console.log(logMessage);
        break;
      case 'WARN':
        console.warn(logMessage);
        break;
      case 'ERROR':
        console.error(logMessage);
        break;
    }
  }
}

/**
 * Create a no-op logger that doesn't output anything
 * Useful for testing or when logging should be disabled
 */
export class NoOpLogger implements ILogger {
  debug(_message: string, _meta?: unknown): void {
    // No-op
  }

  info(_message: string, _meta?: unknown): void {
    // No-op
  }

  warn(_message: string, _meta?: unknown): void {
    // No-op
  }

  error(_message: string, _meta?: unknown): void {
    // No-op
  }

  setLevel(_level: LogLevel): void {
    // No-op
  }

  getLevel(): LogLevel {
    return LogLevel.NONE;
  }
}
