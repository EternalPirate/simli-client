/**
 * State management types for SimliClient
 */

/**
 * Connection state enum
 */
export enum ConnectionState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
  RECONNECTING = 'reconnecting',
}

/**
 * Connection state type (union of string literals)
 */
export type ConnectionStateType =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'failed'
  | 'reconnecting';

/**
 * Session state
 */
export type SessionState =
  | 'uninitialized'
  | 'initializing'
  | 'active'
  | 'paused'
  | 'ended'
  | 'error';

/**
 * Media state for video and audio
 */
export interface MediaState {
  video: 'idle' | 'initializing' | 'ready' | 'streaming' | 'paused' | 'stopped' | 'error';
  audio: 'idle' | 'initializing' | 'ready' | 'streaming' | 'paused' | 'stopped' | 'error';
}

/**
 * Audio state
 */
export enum AudioState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  STREAMING = 'streaming',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
}

/**
 * Video state
 */
export enum VideoState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  PLAYING = 'playing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
}

/**
 * Overall client state
 */
export interface ClientState {
  /** Current connection state */
  connection: ConnectionState;
  
  /** Current audio state */
  audio: AudioState;
  
  /** Current video state */
  video: VideoState;
  
  /** Whether client is ready for interaction */
  isReady: boolean;
  
  /** Whether audio input is active */
  isAudioActive: boolean;
  
  /** Last error if any */
  lastError?: Error;
  
  /** State update timestamp */
  updatedAt: number;
}

/**
 * Session information
 */
export interface SessionInfo {
  /** Unique session ID */
  sessionId: string;
  
  /** Session start timestamp */
  startedAt: number;
  
  /** Session end timestamp (if ended) */
  endedAt?: number;
  
  /** Session duration in milliseconds */
  duration?: number;
  
  /** Face ID being used */
  faceId: string;
  
  /** Total data sent in bytes */
  bytesSent?: number;
  
  /** Total data received in bytes */
  bytesReceived?: number;
}

/**
 * State transition
 */
export interface StateTransition<T = any> {
  /** Previous state */
  from: T;
  
  /** New state */
  to: T;
  
  /** Timestamp of transition */
  timestamp: number;
  
  /** Optional reason for transition */
  reason?: string;
}

/**
 * Connection statistics
 */
export interface ConnectionStats {
  /** Connection attempt count */
  attempts: number;
  
  /** Successful connection count */
  successes: number;
  
  /** Failed connection count */
  failures: number;
  
  /** Last connection attempt timestamp */
  lastAttempt?: number;
  
  /** Last successful connection timestamp */
  lastSuccess?: number;
  
  /** Current connection uptime in milliseconds */
  uptime?: number;
}
