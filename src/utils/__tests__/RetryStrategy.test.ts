import { RetryStrategy, retry } from '../RetryStrategy';

// Helper to create a failing function that succeeds on the Nth attempt
const createFlakeyOperation = <T>(succeedOnAttempt: number, successValue: T) => {
  let attempts = 0;
  return jest.fn(async () => {
    attempts++;
    if (attempts < succeedOnAttempt) {
      throw new Error(`Attempt ${attempts} failed`);
    }
    return successValue;
  });
};

describe('RetryStrategy', () => {
  describe('execute()', () => {
    it('should succeed on first attempt if operation succeeds', async () => {
      const strategy = new RetryStrategy();
      const operation = jest.fn(async () => 'success');

      const result = await strategy.execute(operation);

      expect(result.success).toBe(true);
      expect(result.value).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalDelay).toBe(0);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry and eventually succeed', async () => {
      const strategy = new RetryStrategy({ 
        maxAttempts: 5, 
        jitter: false,
        initialDelay: 10,
        backoffMultiplier: 1.5
      });
      const operation = createFlakeyOperation(3, 'success');

      const result = await strategy.execute(operation);

      expect(result.success).toBe(true);
      expect(result.value).toBe('success');
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    }, 10000);

    it('should fail after max attempts', async () => {
      const strategy = new RetryStrategy({ 
        maxAttempts: 3, 
        jitter: false,
        initialDelay: 5
      });
      const error = new Error('Always fails');
      const operation = jest.fn(async () => {
        throw error;
      });

      const result = await strategy.execute(operation);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.attempts).toBe(3);
      expect(result.value).toBeUndefined();
      expect(operation).toHaveBeenCalledTimes(3);
    }, 10000);

    it('should call onRetry callback before each retry', async () => {
      const strategy = new RetryStrategy({ 
        maxAttempts: 3, 
        jitter: false, 
        initialDelay: 5
      });
      const operation = createFlakeyOperation(3, 'success');
      const onRetry = jest.fn();

      await strategy.execute(operation, onRetry);

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Number), expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Number), expect.any(Error));
    }, 10000);

    it('should respect shouldRetry configuration', async () => {
      const strategy = new RetryStrategy({
        maxAttempts: 5,
        shouldRetry: (error) => error.message.includes('RETRY_ME'),
      });

      const nonRetryableError = new Error('permanent failure');
      const operation = jest.fn(async () => {
        throw nonRetryableError;
      });

      const result = await strategy.execute(operation);

      expect(result.success).toBe(false);
      expect(result.error).toBe(nonRetryableError);
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    }, 10000);

    it('should retry on retryable errors', async () => {
      const strategy = new RetryStrategy({
        maxAttempts: 3,
        shouldRetry: (error) => error.message.includes('RETRY_ME'),
        jitter: false,
        initialDelay: 5,
      });

      let attempt = 0;
      const operation = jest.fn(async () => {
        attempt++;
        if (attempt < 3) {
          throw new Error('RETRY_ME temporary error');
        }
        return 'success';
      });

      const result = await strategy.execute(operation);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    }, 10000);
  });

  describe('Exponential backoff', () => {
    it('should increase delay exponentially', async () => {
      const strategy = new RetryStrategy({
        maxAttempts: 4,
        initialDelay: 10,
        backoffMultiplier: 2,
        jitter: false,
      });

      const operation = jest.fn(async () => {
        throw new Error('fail');
      });
      const onRetry = jest.fn();

      await strategy.execute(operation, onRetry);

      expect(onRetry).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, 10, expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, 20, expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(3, 3, 40, expect.any(Error));
    }, 10000);

    it('should cap delay at maxDelay', async () => {
      const strategy = new RetryStrategy({
        maxAttempts: 5,
        initialDelay: 100,
        maxDelay: 250,
        backoffMultiplier: 2,
        jitter: false,
      });

      const operation = jest.fn(async () => {
        throw new Error('fail');
      });
      const onRetry = jest.fn();

      await strategy.execute(operation, onRetry);

      expect(onRetry).toHaveBeenNthCalledWith(1, 1, 100, expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, 200, expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(3, 3, 250, expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(4, 4, 250, expect.any(Error));
    }, 15000);

    it('should add jitter when enabled', async () => {
      const strategy = new RetryStrategy({
        maxAttempts: 3,
        initialDelay: 100,
        jitter: true,
      });

      const operation = jest.fn(async () => {
        throw new Error('fail');
      });
      const onRetry = jest.fn();

      await strategy.execute(operation, onRetry);

      expect(onRetry).toHaveBeenCalledTimes(2);
      
      const delay1 = (onRetry.mock.calls[0] as any)[1];
      const delay2 = (onRetry.mock.calls[1] as any)[1];
      
      expect(delay1).toBeGreaterThanOrEqual(0);
      expect(delay1).toBeLessThanOrEqual(100);
      expect(delay2).toBeGreaterThanOrEqual(0);
      expect(delay2).toBeLessThanOrEqual(200);
    }, 10000);
  });

  describe('totalDelay tracking', () => {
    it('should track total delay across retries', async () => {
      const strategy = new RetryStrategy({
        maxAttempts: 3,
        initialDelay: 10,
        backoffMultiplier: 2,
        jitter: false,
      });

      const operation = createFlakeyOperation(3, 'success');

      const result = await strategy.execute(operation);

      expect(result.totalDelay).toBe(30);
    }, 10000);
  });

  describe('getConfig() and updateConfig()', () => {
    it('should return current configuration', () => {
      const config = {
        maxAttempts: 3,
        initialDelay: 500,
        maxDelay: 10000,
      };
      const strategy = new RetryStrategy(config);

      const returnedConfig = strategy.getConfig();

      expect(returnedConfig.maxAttempts).toBe(3);
      expect(returnedConfig.initialDelay).toBe(500);
      expect(returnedConfig.maxDelay).toBe(10000);
    });

    it('should update configuration', () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      
      strategy.updateConfig({ maxAttempts: 5, initialDelay: 2000 });
      
      const config = strategy.getConfig();
      expect(config.maxAttempts).toBe(5);
      expect(config.initialDelay).toBe(2000);
    });
  });

  describe('Error handling', () => {
    it('should handle non-Error thrown values', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 2, jitter: false, initialDelay: 5 });
      const operation = jest.fn(async () => {
        throw 'string error';
      });

      const result = await strategy.execute(operation);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('string error');
    }, 10000);
  });
});

describe('retry() helper function', () => {
  it('should work as a standalone function', async () => {
    const operation = createFlakeyOperation(2, 'success');

    const result = await retry(operation, {
      maxAttempts: 3,
      jitter: false,
      initialDelay: 5,
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.attempts).toBe(2);
  }, 10000);

  it('should use default config when not provided', async () => {
    const operation = jest.fn(async () => 'success');

    const result = await retry(operation);

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
  });
});
