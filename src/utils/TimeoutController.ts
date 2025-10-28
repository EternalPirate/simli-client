/**
 * Timeout controller for managing async operation timeouts
 * Wraps AbortController for clean timeout handling
 */

export interface TimeoutConfig {
  /** Timeout duration in milliseconds */
  timeout: number;
  /** Optional error message for timeout */
  message?: string;
}

/**
 * Error thrown when a timeout occurs
 */
export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Controller for managing async operation timeouts using AbortController
 * 
 * @example
 * ```typescript
 * const controller = new TimeoutController({ timeout: 5000 });
 * 
 * try {
 *   const response = await fetch('https://api.example.com', {
 *     signal: controller.signal
 *   });
 *   controller.clear();
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.log('Request timed out');
 *   }
 * }
 * ```
 */
export class TimeoutController {
  private abortController: AbortController;
  private timeoutId?: ReturnType<typeof setTimeout>;
  private _timedOut: boolean = false;
  private readonly config: TimeoutConfig;

  constructor(config: TimeoutConfig) {
    this.config = config;
    this.abortController = new AbortController();
    this.start();
  }

  /**
   * Get the AbortSignal to pass to fetch() or other abortable APIs
   */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Check if the timeout has occurred
   */
  get timedOut(): boolean {
    return this._timedOut;
  }

  /**
   * Start the timeout countdown
   * Called automatically in constructor
   */
  private start(): void {
    this.timeoutId = setTimeout(() => {
      this._timedOut = true;
      this.abortController.abort(
        new TimeoutError(this.config.message || `Operation timed out after ${this.config.timeout}ms`)
      );
    }, this.config.timeout);
  }

  /**
   * Clear the timeout to prevent it from firing
   * Should be called when the operation completes successfully
   */
  clear(): void {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  /**
   * Manually abort the operation
   * @param reason - Optional abort reason
   */
  abort(reason?: any): void {
    this.clear();
    this.abortController.abort(reason);
  }

  /**
   * Check if the operation was aborted (either by timeout or manually)
   */
  get aborted(): boolean {
    return this.abortController.signal.aborted;
  }

  /**
   * Get the abort reason if available
   */
  get reason(): any {
    return this.abortController.signal.reason;
  }
}

/**
 * Helper function to wrap a promise with a timeout
 * @param promise - The promise to wrap
 * @param timeout - Timeout in milliseconds
 * @param message - Optional timeout error message
 * @returns Promise that rejects with TimeoutError if timeout occurs
 * 
 * @example
 * ```typescript
 * try {
 *   const data = await withTimeout(
 *     fetch('https://api.example.com'),
 *     5000,
 *     'API request timed out'
 *   );
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.log('Timed out!');
 *   }
 * }
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  message?: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(message || `Operation timed out after ${timeout}ms`));
    }, timeout);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Helper function to create a delay promise with optional abort signal
 * @param ms - Delay in milliseconds
 * @param signal - Optional AbortSignal to cancel the delay
 * @returns Promise that resolves after the delay or rejects if aborted
 * 
 * @example
 * ```typescript
 * const controller = new TimeoutController({ timeout: 5000 });
 * await delay(1000, controller.signal);
 * ```
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new Error('Aborted'));
      return;
    }

    const timeoutId = setTimeout(() => {
      resolve();
    }, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(signal.reason || new Error('Aborted'));
    });
  });
}
