/**
 * Session Manager
 * 
 * Manages session lifecycle with:
 * - Session creation and initialization
 * - Session state tracking
 * - Session metadata management
 * - Session cleanup
 */

import { EventEmitter } from '../utils/EventEmitter';
import { Logger, LogLevel } from '../utils/Logger';

/**
 * Session Manager Events
 */
export interface SessionManagerEvents {
  sessionCreated: { sessionId: string; metadata: SessionMetadata };
  sessionStarted: { sessionId: string };
  sessionEnded: { sessionId: string; duration: number };
  sessionError: { error: Error };
  metadataUpdated: { metadata: SessionMetadata };
}

/**
 * Session state
 */
export type SessionState = 'idle' | 'creating' | 'active' | 'paused' | 'ended' | 'error';

/**
 * Session metadata
 */
export interface SessionMetadata {
  sessionId: string;
  faceId: string;
  model: 'fasttalk' | 'artalk';
  startTime: number;
  endTime?: number;
  duration?: number;
  bytesSent?: number;
  bytesReceived?: number;
  audioPacketsSent?: number;
  videoFramesReceived?: number;
}

/**
 * Session Manager Configuration
 */
export interface SessionManagerConfig {
  faceId: string;
  model?: 'fasttalk' | 'artalk';
  maxSessionLength?: number;
  maxIdleTime?: number;
  enableLogging?: boolean;
}

/**
 * Session Manager
 * 
 * Tracks and manages session lifecycle and metadata.
 */
export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private logger: Logger;
  private state: SessionState = 'idle';
  private config: Required<SessionManagerConfig>;
  private metadata: SessionMetadata | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private sessionTimer: NodeJS.Timeout | null = null;
  private lastActivityTime = 0;

  constructor(config: SessionManagerConfig) {
    super();

    this.config = {
      model: 'artalk',
      maxSessionLength: 3600, // 1 hour
      maxIdleTime: 600, // 10 minutes
      enableLogging: false,
      ...config,
    };

    this.logger = new Logger(
      'SessionManager',
      this.config.enableLogging ? LogLevel.DEBUG : LogLevel.NONE,
    );
  }

  /**
   * Get current session state
   */
  public getState(): SessionState {
    return this.state;
  }

  /**
   * Get session metadata
   */
  public getMetadata(): SessionMetadata | null {
    return this.metadata ? { ...this.metadata } : null;
  }

  /**
   * Get current session ID
   */
  public getSessionId(): string | null {
    return this.metadata?.sessionId || null;
  }

  /**
   * Create a new session
   */
  public createSession(sessionId: string): void {
    if (this.state === 'active') {
      this.logger.warn('Session already active, ending previous session');
      this.endSession();
    }

    this.setState('creating');

    this.metadata = {
      sessionId,
      faceId: this.config.faceId,
      model: this.config.model,
      startTime: Date.now(),
      bytesSent: 0,
      bytesReceived: 0,
      audioPacketsSent: 0,
      videoFramesReceived: 0,
    };

    this.logger.info('Session created', { sessionId });
    this.emit('sessionCreated', { sessionId, metadata: this.metadata });
  }

  /**
   * Start the session
   */
  public startSession(): void {
    if (!this.metadata) {
      throw new Error('No session created');
    }

    if (this.state === 'active') {
      this.logger.warn('Session already active');
      return;
    }

    this.setState('active');
    this.lastActivityTime = Date.now();

    // Start timers
    this.startIdleTimer();
    this.startSessionTimer();

    this.logger.info('Session started', { sessionId: this.metadata.sessionId });
    this.emit('sessionStarted', { sessionId: this.metadata.sessionId });
  }

  /**
   * Pause the session
   */
  public pauseSession(): void {
    if (this.state !== 'active') {
      return;
    }

    this.setState('paused');
    this.clearTimers();

    this.logger.info('Session paused');
  }

  /**
   * Resume the session
   */
  public resumeSession(): void {
    if (this.state !== 'paused') {
      return;
    }

    this.setState('active');
    this.lastActivityTime = Date.now();
    this.startIdleTimer();
    this.startSessionTimer();

    this.logger.info('Session resumed');
  }

  /**
   * End the session
   */
  public endSession(): void {
    if (!this.metadata) {
      return;
    }

    const endTime = Date.now();
    const duration = endTime - this.metadata.startTime;

    this.metadata = {
      ...this.metadata,
      endTime,
      duration,
    };

    this.clearTimers();
    this.setState('ended');

    this.logger.info('Session ended', {
      sessionId: this.metadata.sessionId,
      duration,
    });

    this.emit('sessionEnded', {
      sessionId: this.metadata.sessionId,
      duration,
    });
  }

  /**
   * Update activity timestamp
   */
  public updateActivity(): void {
    this.lastActivityTime = Date.now();

    // Reset idle timer
    if (this.state === 'active') {
      this.clearIdleTimer();
      this.startIdleTimer();
    }
  }

  /**
   * Update session statistics
   */
  public updateStats(stats: {
    bytesSent?: number;
    bytesReceived?: number;
    audioPacketsSent?: number;
    videoFramesReceived?: number;
  }): void {
    if (!this.metadata) {
      return;
    }

    this.metadata = {
      ...this.metadata,
      bytesSent: stats.bytesSent ?? this.metadata.bytesSent,
      bytesReceived: stats.bytesReceived ?? this.metadata.bytesReceived,
      audioPacketsSent: stats.audioPacketsSent ?? this.metadata.audioPacketsSent,
      videoFramesReceived: stats.videoFramesReceived ?? this.metadata.videoFramesReceived,
    };

    this.emit('metadataUpdated', { metadata: this.metadata });
  }

  /**
   * Increment bytes sent
   */
  public addBytesSent(bytes: number): void {
    if (this.metadata) {
      this.metadata.bytesSent = (this.metadata.bytesSent || 0) + bytes;
      this.updateActivity();
    }
  }

  /**
   * Increment bytes received
   */
  public addBytesReceived(bytes: number): void {
    if (this.metadata) {
      this.metadata.bytesReceived = (this.metadata.bytesReceived || 0) + bytes;
      this.updateActivity();
    }
  }

  /**
   * Increment audio packets sent
   */
  public incrementAudioPackets(): void {
    if (this.metadata) {
      this.metadata.audioPacketsSent = (this.metadata.audioPacketsSent || 0) + 1;
      this.updateActivity();
    }
  }

  /**
   * Increment video frames received
   */
  public incrementVideoFrames(): void {
    if (this.metadata) {
      this.metadata.videoFramesReceived = (this.metadata.videoFramesReceived || 0) + 1;
      this.updateActivity();
    }
  }

  /**
   * Check if session is active
   */
  public isActive(): boolean {
    return this.state === 'active';
  }

  /**
   * Get session duration
   */
  public getDuration(): number {
    if (!this.metadata) {
      return 0;
    }

    if (this.metadata.endTime) {
      return this.metadata.duration || 0;
    }

    return Date.now() - this.metadata.startTime;
  }

  /**
   * Get idle time
   */
  public getIdleTime(): number {
    if (!this.lastActivityTime) {
      return 0;
    }

    return Date.now() - this.lastActivityTime;
  }

  /**
   * Start idle timer
   */
  private startIdleTimer(): void {
    this.clearIdleTimer();

    this.idleTimer = setTimeout(() => {
      this.logger.warn('Session idle timeout', {
        idleTime: this.getIdleTime(),
        maxIdleTime: this.config.maxIdleTime,
      });
      this.endSession();
    }, this.config.maxIdleTime * 1000);
  }

  /**
   * Start session timer
   */
  private startSessionTimer(): void {
    this.clearSessionTimer();

    this.sessionTimer = setTimeout(() => {
      this.logger.warn('Session length timeout', {
        duration: this.getDuration(),
        maxLength: this.config.maxSessionLength,
      });
      this.endSession();
    }, this.config.maxSessionLength * 1000);
  }

  /**
   * Clear idle timer
   */
  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Clear session timer
   */
  private clearSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    this.clearIdleTimer();
    this.clearSessionTimer();
  }

  /**
   * Destroy session manager
   */
  public destroy(): void {
    this.endSession();
    this.clearTimers();
    this.removeAllListeners();
    this.metadata = null;
    this.logger.info('Session manager destroyed');
  }

  /**
   * Set session state
   */
  private setState(state: SessionState): void {
    if (this.state !== state) {
      this.state = state;
      this.logger.debug('State changed', { state });
    }
  }

  /**
   * Get session summary
   */
  public getSummary(): {
    state: SessionState;
    sessionId: string | null;
    duration: number;
    idleTime: number;
    stats: {
      bytesSent: number;
      bytesReceived: number;
      audioPacketsSent: number;
      videoFramesReceived: number;
    } | null;
  } {
    return {
      state: this.state,
      sessionId: this.metadata?.sessionId || null,
      duration: this.getDuration(),
      idleTime: this.getIdleTime(),
      stats: this.metadata ? {
        bytesSent: this.metadata.bytesSent || 0,
        bytesReceived: this.metadata.bytesReceived || 0,
        audioPacketsSent: this.metadata.audioPacketsSent || 0,
        videoFramesReceived: this.metadata.videoFramesReceived || 0,
      } : null,
    };
  }
}
