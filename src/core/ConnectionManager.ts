/**
 * Connection Manager
 * 
 * Manages the complete connection lifecycle:
 * - Session initialization and token management
 * - ICE server retrieval
 * - Connection establishment and teardown
 * - Reconnection logic
 * - Connection health monitoring
 */

import { EventEmitter } from '../utils/EventEmitter';
import { Logger, LogLevel } from '../utils/Logger';
import { RetryStrategy } from '../utils/RetryStrategy';
import { TransportManager } from '../transport/TransportManager';
import { SessionTokenRequest, SessionTokenResponse } from '../types/protocol.types';
import { SimliConfig } from '../types/config.types';

/**
 * Connection Manager Events
 */
export interface ConnectionManagerEvents {
  connected: void;
  disconnected: { reason: string };
  reconnecting: { attempt: number };
  error: { error: Error };
  sessionInitialized: { sessionToken: string };
}

/**
 * Connection state
 */
export type ConnectionState =
  | 'idle'
  | 'initializing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting'
  | 'disconnected'
  | 'failed';

/**
 * Connection Manager
 * 
 * Orchestrates the entire connection process including
 * session management, transport coordination, and reconnection.
 */
export class ConnectionManager extends EventEmitter<ConnectionManagerEvents> {
  private logger: Logger;
  private transportManager: TransportManager | null = null;
  private retryStrategy: RetryStrategy;
  private state: ConnectionState = 'idle';
  private config: SimliConfig;
  private sessionToken: string | null = null;
  private iceServers: RTCIceServer[] = [];
  private reconnectAttempt = 0;
  private isManualDisconnect = false;

  constructor(config: SimliConfig) {
    super();
    this.config = config;

    this.logger = new Logger(
      'ConnectionManager',
      this.config.enableConsoleLogs ? LogLevel.DEBUG : LogLevel.NONE,
    );

    this.retryStrategy = new RetryStrategy({
      maxAttempts: config.maxRetryAttempts || 100,
      initialDelay: config.retryDelay_ms || 2000,
      maxDelay: 30000,
      jitter: true,
    });
  }

  /**
   * Get current connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Initialize connection
   */
  public async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      this.logger.warn('Already connected or connecting');
      return;
    }

    this.isManualDisconnect = false;
    this.setState('initializing');

    try {
      // Step 1: Get ICE servers and session token if needed
      await this.initialize();

      // Step 2: Create transport manager
      this.createTransportManager();

      // Step 3: Connect transports
      this.setState('connecting');
      await this.transportManager!.connect(this.sessionToken || undefined);

      this.setState('connected');
      this.reconnectAttempt = 0;
      this.emit('connected', undefined);
    } catch (error) {
      this.logger.error('Connection failed', { error });
      this.setState('failed');
      this.emit('error', { error: error as Error });

      // Attempt reconnection if not manual disconnect
      if (!this.isManualDisconnect && this.reconnectAttempt < (this.config.maxRetryAttempts || 100)) {
        await this.attemptReconnect();
      } else {
        throw error;
      }
    }
  }

  /**
   * Initialize session (get ICE servers and session token)
   */
  private async initialize(): Promise<void> {
    this.logger.info('Initializing session');

    // Get ICE servers if not provided
    if (!this.iceServers || this.iceServers.length === 0) {
      this.iceServers = await this.getIceServers();
    }

    // Get session token if not provided
    if (!this.sessionToken && !this.config.session_token) {
      const tokenResponse = await this.createSessionToken();
      this.sessionToken = tokenResponse.session_token;
      this.emit('sessionInitialized', { sessionToken: this.sessionToken });
    } else if (this.config.session_token) {
      this.sessionToken = this.config.session_token;
    }

    this.logger.info('Session initialized', {
      hasToken: !!this.sessionToken,
      iceServerCount: this.iceServers.length,
    });
  }

  /**
   * Get ICE servers from API
   */
  private async getIceServers(): Promise<RTCIceServer[]> {
    const url = `${this.getBaseUrl()}/getIceServers`;

    this.logger.info('Fetching ICE servers', { url });

    try {
      const response = await Promise.race<Response>([
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: this.config.apiKey }),
        }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('ICE server request timeout')), 5000)
        ),
      ]);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const iceServers = await response.json();

      if (!iceServers || iceServers.length === 0) {
        throw new Error('No ICE servers returned');
      }

      this.logger.info('ICE servers retrieved', { count: iceServers.length });
      return iceServers;
    } catch (error) {
      this.logger.warn('Failed to get ICE servers, using fallback', { error });
      return [{ urls: ['stun:stun.l.google.com:19302'] }];
    }
  }

  /**
   * Create session token
   */
  private async createSessionToken(): Promise<SessionTokenResponse> {
    const url = `${this.getBaseUrl()}/startAudioToVideoSession`;

    const request: SessionTokenRequest = {
      faceId: this.config.faceID,
      isJPG: false,
      apiKey: this.config.apiKey,
      syncAudio: true,
      handleSilence: this.config.handleSilence,
      maxSessionLength: this.config.maxSessionLength,
      maxIdleTime: this.config.maxIdleTime,
      model: this.config.model || 'artalk',
    };

    this.logger.info('Creating session token');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Session creation failed: ${errorText}`);
      }

      const result = await response.json();
      this.logger.info('Session token created');
      return result;
    } catch (error) {
      this.logger.error('Failed to create session token', { error });
      throw error;
    }
  }

  /**
   * Get base URL for API calls
   */
  private getBaseUrl(): string {
    const simliUrl = this.config.SimliURL || 's://api.simli.ai';
    return `http${simliUrl}`;
  }

  /**
   * Create transport manager
   */
  private createTransportManager(): void {
    if (this.transportManager) {
      this.logger.warn('Transport manager already exists, destroying...');
      this.transportManager.destroy();
    }

    const wsUrl = `ws${this.config.SimliURL || 's://api.simli.ai'}`;

    this.transportManager = new TransportManager({
      websocketUrl: wsUrl,
      iceServers: this.iceServers,
      enableSFU: this.config.enableSFU ?? true,
      connectionTimeout: this.config.videoReceivedTimeout || 15000,
      maxReconnectAttempts: this.config.maxRetryAttempts || 100,
      reconnectDelay: this.config.retryDelay_ms || 2000,
      enableLogging: this.config.enableConsoleLogs,
    });

    this.setupTransportListeners();
  }

  /**
   * Setup transport manager event listeners
   */
  private setupTransportListeners(): void {
    if (!this.transportManager) return;

    this.transportManager.on('connected', () => {
      this.logger.info('Transport connected');
      this.setState('connected');
      this.reconnectAttempt = 0;
      this.emit('connected', undefined);
    });

    this.transportManager.on('disconnected', (data) => {
      this.logger.warn('Transport disconnected', data);
      this.setState('disconnected');
      this.emit('disconnected', data);

      // Attempt reconnection if not manual
      if (!this.isManualDisconnect && this.reconnectAttempt < (this.config.maxRetryAttempts || 100)) {
        this.attemptReconnect();
      }
    });

    this.transportManager.on('error', (data) => {
      this.logger.error('Transport error', data);
      this.emit('error', data);
    });
  }

  /**
   * Attempt to reconnect
   */
  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempt++;
    this.setState('reconnecting');
    this.emit('reconnecting', { attempt: this.reconnectAttempt });

    const delay = Math.min(
      (this.config.retryDelay_ms || 2000) * Math.pow(2, this.reconnectAttempt - 1),
      30000
    );

    this.logger.info('Reconnecting', {
      attempt: this.reconnectAttempt,
      delay,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.connect();
    } catch (error) {
      this.logger.error('Reconnection failed', { error });
      // Will trigger another reconnect via the error handler
    }
  }

  /**
   * Get transport manager
   */
  public getTransportManager(): TransportManager | null {
    return this.transportManager;
  }

  /**
   * Disconnect
   */
  public async disconnect(): Promise<void> {
    this.isManualDisconnect = true;
    this.setState('disconnecting');

    if (this.transportManager) {
      await this.transportManager.close();
    }

    this.setState('disconnected');
    this.emit('disconnected', { reason: 'Manual disconnect' });
  }

  /**
   * Destroy and cleanup
   */
  public destroy(): void {
    this.isManualDisconnect = true;

    if (this.transportManager) {
      this.transportManager.destroy();
      this.transportManager = null;
    }

    this.removeAllListeners();
    this.logger.info('Connection manager destroyed');
  }

  /**
   * Set connection state
   */
  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.logger.debug('State changed', { state });
    }
  }

  /**
   * Get connection info
   */
  public getConnectionInfo(): {
    state: ConnectionState;
    sessionToken: string | null;
    reconnectAttempt: number;
    transportStats: ReturnType<TransportManager['getStats']> | null;
  } {
    return {
      state: this.state,
      sessionToken: this.sessionToken,
      reconnectAttempt: this.reconnectAttempt,
      transportStats: this.transportManager?.getStats() || null,
    };
  }
}
