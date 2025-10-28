/**
 * State Manager
 * 
 * Manages application state with:
 * - Type-safe state machine
 * - State transition validation
 * - State history tracking
 * - State change notifications
 */

import { EventEmitter } from '../utils/EventEmitter';
import { Logger, LogLevel } from '../utils/Logger';
import {
  ConnectionStateType,
  SessionState,
  MediaState,
} from '../types/state.types';

/**
 * State Manager Events
 */
export interface StateManagerEvents {
  stateChange: { 
    previousState: ApplicationState;
    currentState: ApplicationState;
  };
  connectionStateChange: { state: ConnectionStateType };
  sessionStateChange: { state: SessionState };
  mediaStateChange: { state: MediaState };
}

/**
 * Complete application state
 */
export interface ApplicationState {
  connection: ConnectionStateType;
  session: SessionState;
  media: MediaState;
  timestamp: number;
}

/**
 * State transition
 */
interface StateTransition {
  from: ConnectionStateType;
  to: ConnectionStateType;
  timestamp: number;
}

/**
 * State Manager Configuration
 */
export interface StateManagerConfig {
  enableLogging?: boolean;
  maxHistorySize?: number;
}

/**
 * State Manager
 * 
 * Centralized state management with validation and history.
 */
export class StateManager extends EventEmitter<StateManagerEvents> {
  private logger: Logger;
  private state: ApplicationState;
  private history: StateTransition[] = [];
  private maxHistorySize: number;

  // Valid state transitions
  private readonly validTransitions: Map<ConnectionStateType, ConnectionStateType[]> = new Map([
    ['disconnected', ['connecting', 'idle']],
    ['connecting', ['connected', 'failed', 'disconnected']],
    ['connected', ['disconnecting', 'reconnecting', 'disconnected']],
    ['reconnecting', ['connected', 'failed', 'disconnected']],
    ['disconnecting', ['disconnected']],
    ['failed', ['connecting', 'disconnected']],
    ['idle', ['connecting', 'disconnected']],
  ]);

  constructor(config: StateManagerConfig = {}) {
    super();

    this.logger = new Logger(
      'StateManager',
      config.enableLogging ? LogLevel.DEBUG : LogLevel.NONE,
    );

    this.maxHistorySize = config.maxHistorySize || 100;

    // Initialize state
    this.state = {
      connection: 'disconnected',
      session: 'uninitialized',
      media: {
        video: 'idle',
        audio: 'idle',
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Get current state
   */
  public getState(): ApplicationState {
    return { ...this.state };
  }

  /**
   * Get connection state
   */
  public getConnectionState(): ConnectionStateType {
    return this.state.connection;
  }

  /**
   * Get session state
   */
  public getSessionState(): SessionState {
    return this.state.session;
  }

  /**
   * Get media state
   */
  public getMediaState(): MediaState {
    return { ...this.state.media };
  }

  /**
   * Set connection state
   */
  public setConnectionState(newState: ConnectionStateType): void {
    const currentState = this.state.connection;

    // Validate transition
    if (!this.isValidTransition(currentState, newState)) {
      this.logger.warn('Invalid state transition', {
        from: currentState,
        to: newState,
      });
      // Allow it anyway but log warning
    }

    if (currentState !== newState) {
      const previousState = { ...this.state };

      // Record transition
      this.recordTransition(currentState, newState);

      // Update state
      this.state = {
        ...this.state,
        connection: newState,
        timestamp: Date.now(),
      };

      this.logger.info('Connection state changed', {
        from: currentState,
        to: newState,
      });

      // Emit events
      this.emit('connectionStateChange', { state: newState });
      this.emit('stateChange', {
        previousState,
        currentState: this.state,
      });
    }
  }

  /**
   * Set session state
   */
  public setSessionState(newState: SessionState): void {
    const currentState = this.state.session;

    if (currentState !== newState) {
      const previousState = { ...this.state };

      this.state = {
        ...this.state,
        session: newState,
        timestamp: Date.now(),
      };

      this.logger.info('Session state changed', {
        from: currentState,
        to: newState,
      });

      this.emit('sessionStateChange', { state: newState });
      this.emit('stateChange', {
        previousState,
        currentState: this.state,
      });
    }
  }

  /**
   * Set media state
   */
  public setMediaState(mediaState: Partial<MediaState>): void {
    const previousState = { ...this.state };
    const currentMedia = this.state.media;

    const newMediaState: MediaState = {
      video: mediaState.video ?? currentMedia.video,
      audio: mediaState.audio ?? currentMedia.audio,
    };

    // Check if anything changed
    if (
      currentMedia.video !== newMediaState.video ||
      currentMedia.audio !== newMediaState.audio
    ) {
      this.state = {
        ...this.state,
        media: newMediaState,
        timestamp: Date.now(),
      };

      this.logger.info('Media state changed', {
        from: currentMedia,
        to: newMediaState,
      });

      this.emit('mediaStateChange', { state: newMediaState });
      this.emit('stateChange', {
        previousState,
        currentState: this.state,
      });
    }
  }

  /**
   * Set video state
   */
  public setVideoState(state: MediaState['video']): void {
    this.setMediaState({ video: state });
  }

  /**
   * Set audio state
   */
  public setAudioState(state: MediaState['audio']): void {
    this.setMediaState({ audio: state });
  }

  /**
   * Check if state transition is valid
   */
  private isValidTransition(from: ConnectionStateType, to: ConnectionStateType): boolean {
    const validNextStates = this.validTransitions.get(from);
    return validNextStates ? validNextStates.includes(to) : false;
  }

  /**
   * Record state transition in history
   */
  private recordTransition(from: ConnectionStateType, to: ConnectionStateType): void {
    this.history.push({
      from,
      to,
      timestamp: Date.now(),
    });

    // Trim history if needed
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get state history
   */
  public getHistory(): StateTransition[] {
    return [...this.history];
  }

  /**
   * Get recent transitions (last N)
   */
  public getRecentTransitions(count: number = 10): StateTransition[] {
    return this.history.slice(-count);
  }

  /**
   * Clear history
   */
  public clearHistory(): void {
    this.history = [];
    this.logger.debug('State history cleared');
  }

  /**
   * Reset to initial state
   */
  public reset(): void {
    const previousState = { ...this.state };

    this.state = {
      connection: 'disconnected',
      session: 'uninitialized',
      media: {
        video: 'idle',
        audio: 'idle',
      },
      timestamp: Date.now(),
    };

    this.clearHistory();

    this.logger.info('State reset');
    this.emit('stateChange', {
      previousState,
      currentState: this.state,
    });
  }

  /**
   * Check if currently connected
   */
  public isConnected(): boolean {
    return this.state.connection === 'connected';
  }

  /**
   * Check if currently connecting
   */
  public isConnecting(): boolean {
    return this.state.connection === 'connecting';
  }

  /**
   * Check if session is active
   */
  public isSessionActive(): boolean {
    return this.state.session === 'active';
  }

  /**
   * Check if video is streaming
   */
  public isVideoStreaming(): boolean {
    return this.state.media.video === 'streaming';
  }

  /**
   * Check if audio is streaming
   */
  public isAudioStreaming(): boolean {
    return this.state.media.audio === 'streaming';
  }

  /**
   * Get state summary for debugging
   */
  public getSummary(): string {
    return JSON.stringify(
      {
        connection: this.state.connection,
        session: this.state.session,
        media: this.state.media,
        timestamp: new Date(this.state.timestamp).toISOString(),
        historySize: this.history.length,
      },
      null,
      2
    );
  }

  /**
   * Destroy state manager
   */
  public destroy(): void {
    this.clearHistory();
    this.removeAllListeners();
    this.logger.info('State manager destroyed');
  }
}
