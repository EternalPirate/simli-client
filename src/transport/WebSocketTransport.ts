/**
 * WebSocket Transport Layer
 * 
 * Handles WebSocket connection management with:
 * - Automatic reconnection with exponential backoff
 * - Message queuing for offline buffering
 * - Connection state management
 * - Heartbeat/ping-pong mechanism
 * - Type-safe event emission
 */

import { EventEmitter } from '../utils/EventEmitter';
import { Logger, LogLevel } from '../utils/Logger';
import { RetryStrategy } from '../utils/RetryStrategy';
import { TimeoutController, TimeoutError } from '../utils/TimeoutController';
import {
  WebSocketMessage,
  WebSocketState,
  SessionTokenRequest,
  SessionTokenResponse,
} from '../types/protocol.types';

/**
 * WebSocket-specific events
 */
export interface WebSocketEvents {
  connected: void;
  disconnected: { reason: string };
  message: WebSocketMessage;
  error: { error: Error };
  reconnecting: { attempt: number };
  stateChange: { state: WebSocketState };
}

/**
 * Message queue item
 */
interface QueuedMessage {
  data: string | ArrayBuffer | Uint8Array;
  timestamp: number;
  priority: 'high' | 'normal' | 'low';
}

/**
 * WebSocket Transport Configuration
 */
export interface WebSocketTransportConfig {
  url: string;
  enableSFU?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  connectionTimeout?: number;
  heartbeatInterval?: number;
  maxQueueSize?: number;
  enableLogging?: boolean;
}

/**
 * WebSocket Transport
 * 
 * Manages WebSocket connections with automatic reconnection,
 * message queuing, and robust error handling.
 */
export class WebSocketTransport extends EventEmitter<WebSocketEvents> {
  private ws: WebSocket | null = null;
  private state: WebSocketState = 'disconnected';
  private logger: Logger;
  private retryStrategy: RetryStrategy;
  private connectionTimeout: TimeoutController;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageQueue: QueuedMessage[] = [];
  private sessionInitialized = false;
  private lastPingTime = 0;
  private pingSendTimes = new Map<string, number>();
  private config: WebSocketTransportConfig;
  private localDescription: RTCSessionDescriptionInit | null = null;
  private sessionToken: string | null = null;
  private reconnectAttempt = 0;
  private isManualClose = false;

  constructor(config: WebSocketTransportConfig) {
    super();
    this.config = {
      enableSFU: true,
      maxReconnectAttempts: 100,
      reconnectDelay: 2000,
      connectionTimeout: 15000,
      heartbeatInterval: 30000,
      maxQueueSize: 1000,
      enableLogging: false,
      ...config,
    };

    this.logger = new Logger(
      'WebSocketTransport',
      this.config.enableLogging ? LogLevel.DEBUG : LogLevel.NONE,
    );

    this.retryStrategy = new RetryStrategy({
      maxAttempts: this.config.maxReconnectAttempts!,
      initialDelay: this.config.reconnectDelay!,
      maxDelay: 30000,
      jitter: true,
    });

    this.connectionTimeout = new TimeoutController({
      timeout: this.config.connectionTimeout!,
    });
  }

  /**
   * Get current WebSocket state
   */
  public getState(): WebSocketState {
    return this.state;
  }

  /**
   * Check if connected and session is initialized
   */
  public isConnected(): boolean {
    return this.state === 'connected' && this.sessionInitialized;
  }

  /**
   * Check if WebSocket is open
   */
  public isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get native WebSocket instance (for advanced usage)
   */
  public getWebSocket(): WebSocket | null {
    return this.ws;
  }

  /**
   * Connect to WebSocket server
   */
  public async connect(
    localDescription?: RTCSessionDescriptionInit,
    sessionToken?: string,
  ): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      this.logger.warn('Already connected or connecting');
      return;
    }

    this.isManualClose = false;
    this.localDescription = localDescription || null;
    this.sessionToken = sessionToken || null;

    try {
      this.setState('connecting');
      await this.createConnection();
    } catch (error) {
      this.logger.error('Connection failed', { error });
      this.setState('error');
      throw error;
    }
  }

  /**
   * Create WebSocket connection
   */
  private async createConnection(): Promise<void> {
    const url = `${this.config.url}/StartWebRTCSession?enableSFU=${this.config.enableSFU}`;
    this.logger.info('Connecting to WebSocket', { url });

    return new Promise((resolve, reject) => {
      const timeout = new TimeoutController({
        timeout: this.config.connectionTimeout!,
      });

      const cleanup = () => {
        timeout.clear();
      };

      // Set connection timeout
      if (timeout.signal.addEventListener) {
        timeout.signal.addEventListener('abort', () => {
          cleanup();
          const error = new Error('WebSocket connection timeout');
          this.logger.error('Connection timeout', { error });
          reject(error);
          this.handleConnectionError(error);
        });
      }

      try {
        this.ws = new WebSocket(url);
        this.setupEventListeners();

        // Wait for connection
        const onOpen = () => {
          cleanup();
          this.ws?.removeEventListener('open', onOpen);
          this.ws?.removeEventListener('error', onError);
          resolve();
        };

        const onError = (event: Event) => {
          cleanup();
          this.ws?.removeEventListener('open', onOpen);
          this.ws?.removeEventListener('error', onError);
          const error = new Error('WebSocket connection error');
          reject(error);
        };

        this.ws.addEventListener('open', onOpen);
        this.ws.addEventListener('error', onError);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  /**
   * Setup WebSocket event listeners
   */
  private setupEventListeners(): void {
    if (!this.ws) return;

    this.ws.addEventListener('open', this.handleOpen.bind(this));
    this.ws.addEventListener('message', this.handleMessage.bind(this));
    this.ws.addEventListener('error', this.handleError.bind(this));
    this.ws.addEventListener('close', this.handleClose.bind(this));
  }

  /**
   * Handle WebSocket open event
   */
  private async handleOpen(): Promise<void> {
    this.logger.info('WebSocket connected');
    this.setState('connected');
    this.reconnectAttempt = 0;
    // Note: RetryStrategy doesn't have a reset() method, we just reset the attempt counter

    // Send local description if available
    if (this.localDescription) {
      await this.send(JSON.stringify(this.localDescription));
    }

    // Send session token if available
    if (this.sessionToken) {
      await this.send(this.sessionToken);
    }

    // Start heartbeat
    this.startHeartbeat();

    // Flush queued messages
    await this.flushMessageQueue();

    this.emit('connected', undefined);
  }

  /**
   * Handle WebSocket message event
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = event.data;

      this.logger.debug('Received message', { type: typeof data });

      // Handle text messages
      if (typeof data === 'string') {
        this.handleTextMessage(data);
      }
      // Handle binary messages
      else if (data instanceof ArrayBuffer || data instanceof Blob) {
        this.handleBinaryMessage(data);
      }
    } catch (error) {
      this.logger.error('Error handling message', { error });
      this.emit('error', { error: error as Error });
    }
  }

  /**
   * Handle text messages
   */
  private handleTextMessage(data: string): void {
    // Handle protocol messages
    if (data === 'START') {
      this.sessionInitialized = true;
      this.logger.info('Session initialized');
      // Send initial audio chunk
      this.send(new Uint8Array(6000));
      return;
    }

    if (data === 'STOP') {
      this.logger.info('Received STOP signal');
      this.close();
      return;
    }

    if (data === 'ACK') {
      this.logger.debug('Received ACK');
      return;
    }

    if (data === 'SPEAK') {
      this.emit('message', { type: 'speak' });
      return;
    }

    if (data === 'SILENT') {
      this.emit('message', { type: 'silent' });
      return;
    }

    if (data.startsWith('pong')) {
      this.handlePong(data);
      return;
    }

    if (data === 'MISSING_SESSION_TOKEN') {
      this.emit('message', { type: 'missing_session_token' });
      return;
    }

    // Try to parse as JSON
    try {
      const message = JSON.parse(data);
      this.emit('message', message);
    } catch {
      this.logger.warn('Received unknown text message', { data });
    }
  }

  /**
   * Handle binary messages
   */
  private handleBinaryMessage(data: ArrayBuffer | Blob): void {
    this.logger.debug('Received binary message');
    this.emit('message', { type: 'binary', data });
  }

  /**
   * Handle pong message
   */
  private handlePong(data: string): void {
    const pingMessage = data.replace('pong', 'ping');
    const pingTime = this.pingSendTimes.get(pingMessage);

    if (pingTime) {
      const latency = Date.now() - pingTime;
      this.logger.debug('Ping latency', { latency });
      this.pingSendTimes.delete(pingMessage);
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(event: Event): void {
    const error = new Error('WebSocket error');
    this.logger.error('WebSocket error', { error, event });
    this.setState('error');
    this.emit('error', { error });
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    this.logger.info('WebSocket closed', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });

    this.stopHeartbeat();
    this.sessionInitialized = false;

    const reason = event.reason || `Code ${event.code}`;
    this.emit('disconnected', { reason });

    // Attempt reconnection if not manually closed
    if (!this.isManualClose && this.reconnectAttempt < this.config.maxReconnectAttempts!) {
      this.attemptReconnect();
    } else {
      this.setState('disconnected');
    }
  }

  /**
   * Handle connection error and trigger reconnect
   */
  private handleConnectionError(error: Error): void {
    this.logger.error('Connection error', { error });
    this.setState('error');
    this.emit('error', { error });

    if (!this.isManualClose && this.reconnectAttempt < this.config.maxReconnectAttempts!) {
      this.attemptReconnect();
    }
  }

  /**
   * Attempt to reconnect
   */
  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempt++;
    this.setState('reconnecting');
    this.emit('reconnecting', { attempt: this.reconnectAttempt });

    // Calculate exponential backoff delay
    const baseDelay = this.config.reconnectDelay!;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempt - 1), 30000);
    
    this.logger.info('Reconnecting', {
      attempt: this.reconnectAttempt,
      delay,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.connect(this.localDescription || undefined, this.sessionToken || undefined);
    } catch (error) {
      this.logger.error('Reconnection failed', { error });
      // Will trigger another reconnect attempt via handleConnectionError
    }
  }

  /**
   * Send message
   */
  public async send(
    data: string | ArrayBuffer | Uint8Array,
    options: { priority?: 'high' | 'normal' | 'low'; queueIfOffline?: boolean } = {},
  ): Promise<void> {
    const { priority = 'normal', queueIfOffline = true } = options;

    // If not connected, queue the message
    if (!this.isOpen()) {
      if (queueIfOffline) {
        this.queueMessage(data, priority);
        this.logger.debug('Message queued (offline)', { priority });
      } else {
        throw new Error('WebSocket not connected');
      }
      return;
    }

    try {
      this.ws!.send(data);
      this.logger.debug('Message sent', {
        type: typeof data,
        size: data instanceof Uint8Array ? data.length : undefined,
      });
    } catch (error) {
      this.logger.error('Failed to send message', { error });

      if (queueIfOffline) {
        this.queueMessage(data, priority);
      } else {
        throw error;
      }
    }
  }

  /**
   * Queue message for later sending
   */
  private queueMessage(
    data: string | ArrayBuffer | Uint8Array,
    priority: 'high' | 'normal' | 'low',
  ): void {
    if (this.messageQueue.length >= this.config.maxQueueSize!) {
      // Remove oldest low-priority message
      const lowPriorityIndex = this.messageQueue.findIndex((m) => m.priority === 'low');
      if (lowPriorityIndex !== -1) {
        this.messageQueue.splice(lowPriorityIndex, 1);
      } else {
        // Remove oldest message
        this.messageQueue.shift();
      }
    }

    this.messageQueue.push({
      data,
      timestamp: Date.now(),
      priority,
    });

    // Sort by priority
    this.messageQueue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Flush message queue
   */
  private async flushMessageQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    this.logger.info('Flushing message queue', {
      count: this.messageQueue.length,
    });

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of messages) {
      try {
        await this.send(message.data, { queueIfOffline: false });
      } catch (error) {
        this.logger.error('Failed to send queued message', { error });
        // Re-queue on failure
        this.queueMessage(message.data, message.priority);
      }
    }
  }

  /**
   * Send ping message
   */
  public sendPing(): void {
    if (!this.isOpen()) return;

    const message = `ping ${Date.now()}`;
    this.pingSendTimes.set(message, Date.now());

    try {
      this.ws!.send(message);
      this.lastPingTime = Date.now();
      this.logger.debug('Ping sent');
    } catch (error) {
      this.logger.error('Failed to send ping', { error });
    }
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    if (this.config.heartbeatInterval && this.config.heartbeatInterval > 0) {
      this.heartbeatInterval = setInterval(() => {
        this.sendPing();
      }, this.config.heartbeatInterval);
    }
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Set local description (for sending after connection)
   */
  public setLocalDescription(description: RTCSessionDescriptionInit): void {
    this.localDescription = description;
  }

  /**
   * Set session token (for sending after connection)
   */
  public setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  /**
   * Clear buffer (send SKIP command)
   */
  public clearBuffer(): void {
    if (this.isOpen()) {
      this.send('SKIP', { priority: 'high' });
    }
  }

  /**
   * Send DONE command
   */
  public sendDone(): void {
    if (this.isOpen()) {
      this.send('DONE', { priority: 'high' });
    }
  }

  /**
   * Close WebSocket connection
   */
  public close(code = 1000, reason = 'Normal closure'): void {
    this.isManualClose = true;
    this.stopHeartbeat();

    if (this.ws) {
      this.logger.info('Closing WebSocket', { code, reason });
      this.ws.close(code, reason);
      this.ws = null;
    }

    this.setState('disconnected');
    this.sessionInitialized = false;
    this.messageQueue = [];
  }

  /**
   * Destroy transport and cleanup
   */
  public destroy(): void {
    this.close();
    this.connectionTimeout.clear();
    this.removeAllListeners();
    this.logger.info('WebSocket transport destroyed');
  }

  /**
   * Set WebSocket state and emit event
   */
  private setState(state: WebSocketState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', { state });
      this.logger.debug('State changed', { state });
    }
  }

  /**
   * Get connection statistics
   */
  public getStats(): {
    state: WebSocketState;
    sessionInitialized: boolean;
    queueSize: number;
    reconnectAttempt: number;
    lastPingTime: number;
  } {
    return {
      state: this.state,
      sessionInitialized: this.sessionInitialized,
      queueSize: this.messageQueue.length,
      reconnectAttempt: this.reconnectAttempt,
      lastPingTime: this.lastPingTime,
    };
  }
}
