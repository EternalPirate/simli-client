/**
 * Retry strategy with exponential backoff for connection resilience
 * Useful for handling transient network failures
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 5) */
  maxAttempts?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Function to determine if error is retryable (default: retry all) */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxAttempts: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: () => true,
};

/**
 * Utility for retrying async operations with exponential backoff
 * 
 * @example
 * ```typescript
 * const retry = new RetryStrategy({
 *   maxAttempts: 3,
 *   initialDelay: 500,
 *   shouldRetry: (error) => error.message.includes('ECONNREFUSED')
 * });
 * 
 * const result = await retry.execute(async () => {
 *   return await fetch('https://api.example.com');
 * });
 * 
 * if (result.success) {
 *   console.log('Success after', result.attempts, 'attempts');
 * }
 * ```
 */
export class RetryStrategy {
  private config: Required<RetryConfig>;

  constructor(config: RetryConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute an async operation with retry logic
   * @param operation - The async function to retry
   * @param onRetry - Optional callback called before each retry
   * @returns Result object with success status, value/error, and metadata
   */
  async execute<T>(
    operation: () => Promise<T>,
    onRetry?: (attempt: number, delay: number, error: Error) => void
  ): Promise<RetryResult<T>> {
    let lastError: Error | undefined;
    let totalDelay = 0;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const value = await operation();
        return {
          success: true,
          value,
          attempts: attempt,
          totalDelay,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry this error
        if (!this.config.shouldRetry(lastError, attempt)) {
          return {
            success: false,
            error: lastError,
            attempts: attempt,
            totalDelay,
          };
        }

        // Don't delay after the last attempt
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          totalDelay += delay;

          if (onRetry) {
            onRetry(attempt, delay, lastError);
          }

          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: this.config.maxAttempts,
      totalDelay,
    };
  }

  /**
   * Calculate delay for a given attempt using exponential backoff
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff: initialDelay * (backoffMultiplier ^ (attempt - 1))
    const exponentialDelay =
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);

    // Cap at maxDelay
    let delay = Math.min(exponentialDelay, this.config.maxDelay);

    // Add jitter if enabled (random value between 0 and delay)
    if (this.config.jitter) {
      delay = Math.random() * delay;
    }

    return Math.floor(delay);
  }

  /**
   * Sleep for a specified duration
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the current retry configuration
   */
  getConfig(): Readonly<Required<RetryConfig>> {
    return { ...this.config };
  }

  /**
   * Update the retry configuration
   * @param config - Partial configuration to merge with existing config
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Helper function to retry an operation without creating a RetryStrategy instance
 * @param operation - The async function to retry
 * @param config - Retry configuration
 * @returns Result object with success status, value/error, and metadata
 */
export async function retry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {}
): Promise<RetryResult<T>> {
  const strategy = new RetryStrategy(config);
  return strategy.execute(operation);
}
