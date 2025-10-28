import { Logger, LogLevel, NoOpLogger } from '../Logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with default prefix and level', () => {
      const logger = new Logger();
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should create logger with custom prefix and level', () => {
      const logger = new Logger('TEST', LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });
  });

  describe('setLevel and getLevel', () => {
    it('should set and get log level', () => {
      const logger = new Logger();
      logger.setLevel(LogLevel.ERROR);
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('debug', () => {
    it('should log debug messages when level is DEBUG', () => {
      const logger = new Logger('TEST', LogLevel.DEBUG);
      logger.debug('test message');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TEST:DEBUG] test message')
      );
    });

    it('should not log debug messages when level is INFO', () => {
      const logger = new Logger('TEST', LogLevel.INFO);
      logger.debug('test message');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should log debug with metadata', () => {
      const logger = new Logger('TEST', LogLevel.DEBUG);
      const meta = { userId: 123, action: 'login' };
      logger.debug('test message', meta);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(meta))
      );
    });
  });

  describe('info', () => {
    it('should log info messages when level is INFO', () => {
      const logger = new Logger('TEST', LogLevel.INFO);
      logger.info('test message');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TEST:INFO] test message')
      );
    });

    it('should not log info messages when level is WARN', () => {
      const logger = new Logger('TEST', LogLevel.WARN);
      logger.info('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should include timestamp', () => {
      const logger = new Logger('TEST', LogLevel.INFO);
      logger.info('test message');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });
  });

  describe('warn', () => {
    it('should log warn messages when level is WARN', () => {
      const logger = new Logger('TEST', LogLevel.WARN);
      logger.warn('test message');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TEST:WARN] test message')
      );
    });

    it('should not log warn messages when level is ERROR', () => {
      const logger = new Logger('TEST', LogLevel.ERROR);
      logger.warn('test message');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error messages when level is ERROR', () => {
      const logger = new Logger('TEST', LogLevel.ERROR);
      logger.error('test message');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TEST:ERROR] test message')
      );
    });

    it('should not log error messages when level is NONE', () => {
      const logger = new Logger('TEST', LogLevel.NONE);
      logger.error('test message');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log error with metadata', () => {
      const logger = new Logger('TEST', LogLevel.ERROR);
      const error = { code: 500, message: 'Internal error' };
      logger.error('test message', error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(error))
      );
    });
  });

  describe('log level hierarchy', () => {
    it('should respect log level hierarchy', () => {
      const logger = new Logger('TEST', LogLevel.WARN);
      
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});

describe('NoOpLogger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should not log anything', () => {
    const logger = new NoOpLogger();
    
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(consoleDebugSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return NONE log level', () => {
    const logger = new NoOpLogger();
    expect(logger.getLevel()).toBe(LogLevel.NONE);
  });

  it('should ignore setLevel', () => {
    const logger = new NoOpLogger();
    logger.setLevel(LogLevel.DEBUG);
    expect(logger.getLevel()).toBe(LogLevel.NONE);
  });
});
