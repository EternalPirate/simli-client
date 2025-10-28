/**
 * Core configuration types for SimliClient
 */

/**
 * Legacy SimliClient configuration (for backward compatibility)
 */
export interface SimliConfig {
  apiKey: string;
  faceID: string;
  handleSilence: boolean;
  maxSessionLength: number;
  maxIdleTime: number;
  session_token: string;
  videoRef: HTMLVideoElement;
  audioRef: HTMLAudioElement;
  enableConsoleLogs?: boolean;
  SimliURL: string;
  maxRetryAttempts: number;
  retryDelay_ms: number;
  videoReceivedTimeout: number;
  enableSFU: boolean;
  model: 'fasttalk' | 'artalk' | '';
}

/**
 * SimliClient configuration options
 */
export interface SimliClientConfig {
  /** Simli API key */
  apiKey: string;
  
  /** Face ID for the avatar */
  faceId: string;
  
  /** WebRTC configuration */
  webRTC?: {
    /** Maximum video bitrate in kbps (default: 2500) */
    maxBitrate?: number;
    
    /** Video resolution (default: '512x512') */
    resolution?: string;
    
    /** Enable/disable audio (default: true) */
    enableAudio?: boolean;
  };
  
  /** Connection retry configuration */
  retry?: {
    /** Maximum retry attempts (default: 3) */
    maxAttempts?: number;
    
    /** Initial retry delay in ms (default: 1000) */
    initialDelay?: number;
  };
  
  /** Timeout configuration */
  timeout?: {
    /** Connection timeout in ms (default: 30000) */
    connection?: number;
    
    /** Request timeout in ms (default: 10000) */
    request?: number;
  };
  
  /** Logger configuration */
  logging?: {
    /** Enable debug logging (default: false) */
    enabled?: boolean;
    
    /** Log level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'NONE' */
    level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'NONE';
  };
  
  /** Auto-start connection on initialization (default: false) */
  autoStart?: boolean;
}

/**
 * Partial configuration for updates
 */
export type PartialSimliClientConfig = Partial<SimliClientConfig>;

/**
 * Required configuration fields
 */
export type RequiredConfig = Pick<SimliClientConfig, 'apiKey' | 'faceId'>;

/**
 * Optional configuration fields
 */
export type OptionalConfig = Omit<SimliClientConfig, keyof RequiredConfig>;
