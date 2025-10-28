/**
 * Config Validator
 * 
 * Validates and normalizes SimliClient configuration with:
 * - Type checking
 * - Range validation
 * - Default value assignment
 * - Helpful error messages
 */

import { Logger, LogLevel } from '../utils/Logger';
import { SimliConfig, SimliClientConfig } from '../types/config.types';

/**
 * Validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(`Configuration error for '${field}': ${message}`);
    this.name = 'ConfigValidationError';
    Object.setPrototypeOf(this, ConfigValidationError.prototype);
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: string[];
}

/**
 * Config Validator
 * 
 * Validates and normalizes configuration objects.
 */
export class ConfigValidator {
  private static logger = new Logger('ConfigValidator', LogLevel.WARN);

  /**
   * Validate legacy SimliConfig
   */
  public static validateLegacyConfig(config: Partial<SimliConfig>): ValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!config.apiKey && !config.session_token) {
      errors.push(
        new ConfigValidationError(
          'apiKey/session_token',
          'Either apiKey or session_token is required'
        )
      );
    }

    if (!config.faceID) {
      errors.push(new ConfigValidationError('faceID', 'faceID is required'));
    }

    // Type validation
    if (config.apiKey !== undefined && typeof config.apiKey !== 'string') {
      errors.push(new ConfigValidationError('apiKey', 'Must be a string'));
    }

    if (config.faceID !== undefined && typeof config.faceID !== 'string') {
      errors.push(new ConfigValidationError('faceID', 'Must be a string'));
    }

    if (config.handleSilence !== undefined && typeof config.handleSilence !== 'boolean') {
      errors.push(new ConfigValidationError('handleSilence', 'Must be a boolean'));
    }

    // Number validations
    if (config.maxSessionLength !== undefined) {
      if (typeof config.maxSessionLength !== 'number') {
        errors.push(new ConfigValidationError('maxSessionLength', 'Must be a number'));
      } else if (config.maxSessionLength <= 0) {
        errors.push(new ConfigValidationError('maxSessionLength', 'Must be positive'));
      } else if (config.maxSessionLength > 7200) {
        warnings.push('maxSessionLength > 7200 (2 hours) may be excessive');
      }
    }

    if (config.maxIdleTime !== undefined) {
      if (typeof config.maxIdleTime !== 'number') {
        errors.push(new ConfigValidationError('maxIdleTime', 'Must be a number'));
      } else if (config.maxIdleTime <= 0) {
        errors.push(new ConfigValidationError('maxIdleTime', 'Must be positive'));
      }
    }

    if (config.maxRetryAttempts !== undefined) {
      if (typeof config.maxRetryAttempts !== 'number') {
        errors.push(new ConfigValidationError('maxRetryAttempts', 'Must be a number'));
      } else if (config.maxRetryAttempts < 0) {
        errors.push(new ConfigValidationError('maxRetryAttempts', 'Must be non-negative'));
      } else if (config.maxRetryAttempts > 1000) {
        warnings.push('maxRetryAttempts > 1000 may cause long wait times');
      }
    }

    if (config.retryDelay_ms !== undefined) {
      if (typeof config.retryDelay_ms !== 'number') {
        errors.push(new ConfigValidationError('retryDelay_ms', 'Must be a number'));
      } else if (config.retryDelay_ms < 0) {
        errors.push(new ConfigValidationError('retryDelay_ms', 'Must be non-negative'));
      }
    }

    if (config.videoReceivedTimeout !== undefined) {
      if (typeof config.videoReceivedTimeout !== 'number') {
        errors.push(new ConfigValidationError('videoReceivedTimeout', 'Must be a number'));
      } else if (config.videoReceivedTimeout < 1000) {
        warnings.push('videoReceivedTimeout < 1000ms may cause premature timeouts');
      }
    }

    // Model validation
    if (config.model !== undefined && config.model !== '') {
      if (!['fasttalk', 'artalk'].includes(config.model)) {
        errors.push(
          new ConfigValidationError('model', `Must be 'fasttalk' or 'artalk', got '${config.model}'`)
        );
      }
    }

    // URL validation
    if (config.SimliURL !== undefined && config.SimliURL !== '') {
      if (typeof config.SimliURL !== 'string') {
        errors.push(new ConfigValidationError('SimliURL', 'Must be a string'));
      } else if (!config.SimliURL.includes('://')) {
        warnings.push('SimliURL should include protocol (e.g., "s://api.simli.ai")');
      }
    }

    // HTML Element validation (browser only)
    if (typeof window !== 'undefined') {
      if (config.videoRef && !(config.videoRef instanceof HTMLVideoElement)) {
        errors.push(
          new ConfigValidationError('videoRef', 'Must be an HTMLVideoElement instance')
        );
      }

      if (config.audioRef && !(config.audioRef instanceof HTMLAudioElement)) {
        errors.push(
          new ConfigValidationError('audioRef', 'Must be an HTMLAudioElement instance')
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate new SimliClientConfig
   */
  public static validateClientConfig(config: Partial<SimliClientConfig>): ValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!config.apiKey) {
      errors.push(new ConfigValidationError('apiKey', 'apiKey is required'));
    }

    if (!config.faceId) {
      errors.push(new ConfigValidationError('faceId', 'faceId is required'));
    }

    // Type validation
    if (config.apiKey !== undefined && typeof config.apiKey !== 'string') {
      errors.push(new ConfigValidationError('apiKey', 'Must be a string'));
    }

    if (config.faceId !== undefined && typeof config.faceId !== 'string') {
      errors.push(new ConfigValidationError('faceId', 'Must be a string'));
    }

    // WebRTC validation
    if (config.webRTC) {
      if (config.webRTC.maxBitrate !== undefined) {
        if (typeof config.webRTC.maxBitrate !== 'number') {
          errors.push(new ConfigValidationError('webRTC.maxBitrate', 'Must be a number'));
        } else if (config.webRTC.maxBitrate <= 0) {
          errors.push(new ConfigValidationError('webRTC.maxBitrate', 'Must be positive'));
        } else if (config.webRTC.maxBitrate > 10000) {
          warnings.push('webRTC.maxBitrate > 10000 kbps is very high');
        }
      }

      if (config.webRTC.resolution !== undefined) {
        if (typeof config.webRTC.resolution !== 'string') {
          errors.push(new ConfigValidationError('webRTC.resolution', 'Must be a string'));
        } else if (!/^\d+x\d+$/.test(config.webRTC.resolution)) {
          errors.push(
            new ConfigValidationError(
              'webRTC.resolution',
              'Must be in format "WIDTHxHEIGHT" (e.g., "1280x720")'
            )
          );
        }
      }

      if (config.webRTC.enableAudio !== undefined && typeof config.webRTC.enableAudio !== 'boolean') {
        errors.push(new ConfigValidationError('webRTC.enableAudio', 'Must be a boolean'));
      }
    }

    // Retry validation
    if (config.retry) {
      if (config.retry.maxAttempts !== undefined) {
        if (typeof config.retry.maxAttempts !== 'number') {
          errors.push(new ConfigValidationError('retry.maxAttempts', 'Must be a number'));
        } else if (config.retry.maxAttempts < 0) {
          errors.push(new ConfigValidationError('retry.maxAttempts', 'Must be non-negative'));
        }
      }

      if (config.retry.initialDelay !== undefined) {
        if (typeof config.retry.initialDelay !== 'number') {
          errors.push(new ConfigValidationError('retry.initialDelay', 'Must be a number'));
        } else if (config.retry.initialDelay < 0) {
          errors.push(new ConfigValidationError('retry.initialDelay', 'Must be non-negative'));
        }
      }
    }

    // Timeout validation
    if (config.timeout) {
      if (config.timeout.connection !== undefined) {
        if (typeof config.timeout.connection !== 'number') {
          errors.push(new ConfigValidationError('timeout.connection', 'Must be a number'));
        } else if (config.timeout.connection < 1000) {
          warnings.push('timeout.connection < 1000ms may cause premature timeouts');
        }
      }

      if (config.timeout.request !== undefined) {
        if (typeof config.timeout.request !== 'number') {
          errors.push(new ConfigValidationError('timeout.request', 'Must be a number'));
        } else if (config.timeout.request < 1000) {
          warnings.push('timeout.request < 1000ms may cause premature timeouts');
        }
      }
    }

    // Logging validation
    if (config.logging) {
      if (config.logging.enabled !== undefined && typeof config.logging.enabled !== 'boolean') {
        errors.push(new ConfigValidationError('logging.enabled', 'Must be a boolean'));
      }

      if (config.logging.level !== undefined) {
        const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];
        if (!validLevels.includes(config.logging.level)) {
          errors.push(
            new ConfigValidationError(
              'logging.level',
              `Must be one of: ${validLevels.join(', ')}`
            )
          );
        }
      }
    }

    // Auto-start validation
    if (config.autoStart !== undefined && typeof config.autoStart !== 'boolean') {
      errors.push(new ConfigValidationError('autoStart', 'Must be a boolean'));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Normalize legacy config with defaults
   */
  public static normalizeLegacyConfig(config: Partial<SimliConfig>): SimliConfig {
    return {
      apiKey: config.apiKey || '',
      faceID: config.faceID || '',
      handleSilence: config.handleSilence ?? true,
      maxSessionLength: config.maxSessionLength || 3600,
      maxIdleTime: config.maxIdleTime || 600,
      session_token: config.session_token || '',
      videoRef: config.videoRef!,
      audioRef: config.audioRef!,
      enableConsoleLogs: config.enableConsoleLogs ?? false,
      SimliURL: config.SimliURL || 's://api.simli.ai',
      maxRetryAttempts: config.maxRetryAttempts || 100,
      retryDelay_ms: config.retryDelay_ms || 2000,
      videoReceivedTimeout: config.videoReceivedTimeout || 15000,
      enableSFU: config.enableSFU ?? true,
      model: config.model || 'artalk',
    };
  }

  /**
   * Normalize client config with defaults
   */
  public static normalizeClientConfig(config: Partial<SimliClientConfig>): SimliClientConfig {
    return {
      apiKey: config.apiKey || '',
      faceId: config.faceId || '',
      webRTC: {
        maxBitrate: config.webRTC?.maxBitrate || 2500,
        resolution: config.webRTC?.resolution || '512x512',
        enableAudio: config.webRTC?.enableAudio ?? true,
      },
      retry: {
        maxAttempts: config.retry?.maxAttempts ?? 3,
        initialDelay: config.retry?.initialDelay ?? 1000,
      },
      timeout: {
        connection: config.timeout?.connection ?? 30000,
        request: config.timeout?.request ?? 10000,
      },
      logging: {
        enabled: config.logging?.enabled ?? false,
        level: config.logging?.level || 'INFO',
      },
      autoStart: config.autoStart ?? false,
    };
  }

  /**
   * Validate and normalize (throws on error)
   */
  public static validateAndNormalize(config: Partial<SimliConfig>): SimliConfig {
    const result = this.validateLegacyConfig(config);

    // Log warnings
    result.warnings.forEach((warning) => {
      this.logger.warn(warning);
    });

    // Throw on errors
    if (!result.valid) {
      const errorMessages = result.errors.map((e) => e.message).join('; ');
      throw new Error(`Configuration validation failed: ${errorMessages}`);
    }

    return this.normalizeLegacyConfig(config);
  }

  /**
   * Safe validation (returns result instead of throwing)
   */
  public static safeValidate(config: Partial<SimliConfig>): {
    config: SimliConfig | null;
    result: ValidationResult;
  } {
    const result = this.validateLegacyConfig(config);

    return {
      config: result.valid ? this.normalizeLegacyConfig(config) : null,
      result,
    };
  }
}
