import { TimeoutController, TimeoutError, withTimeout, delay } from '../TimeoutController';

describe('TimeoutController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor and basic properties', () => {
    it('should create a controller with signal', () => {
      const controller = new TimeoutController({ timeout: 1000 });

      expect(controller.signal).toBeInstanceOf(AbortSignal);
      expect(controller.timedOut).toBe(false);
      expect(controller.aborted).toBe(false);
      
      controller.clear();
    });

    it('should abort after timeout', () => {
      const controller = new TimeoutController({ timeout: 1000 });

      jest.advanceTimersByTime(1000);

      expect(controller.timedOut).toBe(true);
      expect(controller.aborted).toBe(true);
      expect(controller.reason).toBeInstanceOf(TimeoutError);
    });

    it('should use custom timeout message', () => {
      const controller = new TimeoutController({
        timeout: 1000,
        message: 'Custom timeout message',
      });

      jest.advanceTimersByTime(1000);

      expect(controller.reason).toBeInstanceOf(TimeoutError);
      expect(controller.reason.message).toBe('Custom timeout message');
    });
  });

  describe('clear()', () => {
    it('should prevent timeout from firing', () => {
      const controller = new TimeoutController({ timeout: 1000 });

      controller.clear();
      jest.advanceTimersByTime(1000);

      expect(controller.timedOut).toBe(false);
      expect(controller.aborted).toBe(false);
    });

    it('should be safe to call multiple times', () => {
      const controller = new TimeoutController({ timeout: 1000 });

      controller.clear();
      controller.clear();
      controller.clear();

      expect(controller.timedOut).toBe(false);
    });
  });

  describe('abort()', () => {
    it('should manually abort the operation', () => {
      const controller = new TimeoutController({ timeout: 1000 });

      controller.abort();

      expect(controller.aborted).toBe(true);
      expect(controller.timedOut).toBe(false);
    });

    it('should abort with custom reason', () => {
      const controller = new TimeoutController({ timeout: 1000 });
      const reason = new Error('Custom abort reason');

      controller.abort(reason);

      expect(controller.aborted).toBe(true);
      expect(controller.reason).toBe(reason);
    });

    it('should clear timeout when manually aborted', () => {
      const controller = new TimeoutController({ timeout: 1000 });

      controller.abort();
      jest.advanceTimersByTime(1000);

      // Should not timeout after manual abort
      expect(controller.timedOut).toBe(false);
    });
  });

  describe('signal integration', () => {
    it('should abort signal on timeout', () => {
      const controller = new TimeoutController({ timeout: 1000 });
      const abortListener = jest.fn();

      controller.signal.addEventListener('abort', abortListener);
      jest.advanceTimersByTime(1000);

      expect(abortListener).toHaveBeenCalled();
      
      controller.clear();
    });

    it('should abort signal on manual abort', () => {
      const controller = new TimeoutController({ timeout: 1000 });
      const abortListener = jest.fn();

      controller.signal.addEventListener('abort', abortListener);
      controller.abort();

      expect(abortListener).toHaveBeenCalled();
    });
  });
});

describe('TimeoutError', () => {
  it('should be instanceof Error', () => {
    const error = new TimeoutError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.name).toBe('TimeoutError');
  });

  it('should have default message', () => {
    const error = new TimeoutError();

    expect(error.message).toBe('Operation timed out');
  });

  it('should accept custom message', () => {
    const error = new TimeoutError('Custom message');

    expect(error.message).toBe('Custom message');
  });
});

describe('withTimeout()', () => {
  beforeEach(() => {
    jest.useRealTimers(); // Use real timers for promise-based tests
  });

  it('should resolve when promise resolves before timeout', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 10);
    });

    const result = await withTimeout(promise, 100);

    expect(result).toBe('success');
  });

  it('should reject with TimeoutError when timeout occurs', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 100);
    });

    await expect(withTimeout(promise, 10)).rejects.toThrow(TimeoutError);
  });

  it('should use custom timeout message', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 100);
    });

    await expect(
      withTimeout(promise, 10, 'Custom timeout')
    ).rejects.toThrow('Custom timeout');
  });

  it('should reject with original error when promise rejects', async () => {
    const originalError = new Error('Original error');
    const promise = Promise.reject(originalError);

    await expect(withTimeout(promise, 100)).rejects.toBe(originalError);
  });

  it('should not reject if promise resolves just before timeout', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 45);
    });

    const result = await withTimeout(promise, 50);

    expect(result).toBe('success');
  });
});

describe('delay()', () => {
  beforeEach(() => {
    jest.useRealTimers(); // Use real timers for delay tests
  });

  it('should resolve after specified delay', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(100);
  });

  it('should reject if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(delay(100, controller.signal)).rejects.toThrow();
  });

  it('should reject if signal aborts during delay', async () => {
    const controller = new AbortController();

    const delayPromise = delay(100, controller.signal);
    
    setTimeout(() => controller.abort(), 20);

    await expect(delayPromise).rejects.toThrow();
  });

  it('should reject with signal reason', async () => {
    const controller = new AbortController();
    const customReason = new Error('Custom abort reason');

    const delayPromise = delay(100, controller.signal);
    
    setTimeout(() => controller.abort(customReason), 20);

    await expect(delayPromise).rejects.toBe(customReason);
  });

  it('should work without signal', async () => {
    const start = Date.now();
    await delay(30);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(25);
  });
});

describe('Integration scenarios', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('should work with fetch-like API', async () => {
    const controller = new TimeoutController({ timeout: 100 });

    const mockFetch = (signal: AbortSignal) =>
      new Promise<string>((resolve, reject) => {
        const timeoutId = setTimeout(() => resolve('data'), 50);

        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(signal.reason);
        });
      });

    const result = await mockFetch(controller.signal);
    controller.clear();

    expect(result).toBe('data');
  });

  it('should timeout slow fetch-like API', async () => {
    const controller = new TimeoutController({ timeout: 50 });

    const mockSlowFetch = (signal: AbortSignal) =>
      new Promise<string>((resolve, reject) => {
        const timeoutId = setTimeout(() => resolve('data'), 200);

        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(signal.reason);
        });
      });

    await expect(mockSlowFetch(controller.signal)).rejects.toThrow(TimeoutError);
  });

  it('should work with retry and timeout together', async () => {
    let attempts = 0;
    const controller = new TimeoutController({ timeout: 200 });

    const operation = async () => {
      attempts++;
      await delay(30, controller.signal);
      if (attempts < 2) {
        throw new Error('Retry me');
      }
      return 'success';
    };

    const result = await operation().catch(() => operation());
    controller.clear();

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });
});
