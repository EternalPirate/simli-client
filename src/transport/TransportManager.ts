/**
 * Transport Manager
 * 
 * Orchestrates both WebSocket and WebRTC transports:
 * - Coordinates connection establishment
 * - Manages signaling via WebSocket
 * - Handles transport lifecycle
 * - Provides unified interface
 */

import { EventEmitter } from '../utils/EventEmitter';
import { Logger, LogLevel } from '../utils/Logger';
import { WebSocketTransport, WebSocketEvents } from './WebSocketTransport';
import { WebRTCTransport, WebRTCEvents } from './WebRTCTransport';
import { WebSocketMessage } from '../types/protocol.types';

/**
 * Transport Manager Events
 */
export interface TransportManagerEvents {
  connected: void;
  disconnected: { reason: string };
  error: { error: Error };
  message: WebSocketMessage;
  track: { track: MediaStreamTrack; streams: MediaStream[] };
  speaking: void;
  silent: void;
}

/**
 * Transport Manager Configuration
 */
export interface TransportManagerConfig {
  // WebSocket config
  websocketUrl: string;
  enableSFU?: boolean;
  enableLogging?: boolean;

  // WebRTC config
  iceServers?: RTCIceServer[];

  // Timeouts
  connectionTimeout?: number;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

/**
 * Transport Manager
 * 
 * Manages WebSocket and WebRTC transports together,
 * handling signaling and media transport coordination.
 */
export class TransportManager extends EventEmitter<TransportManagerEvents> {
  private wsTransport: WebSocketTransport;
  private rtcTransport: WebRTCTransport;
  private logger: Logger;
  private config: Required<TransportManagerConfig>;
  private isConnecting = false;
  private isConnected = false;

  constructor(config: TransportManagerConfig) {
    super();

    this.config = {
      enableSFU: true,
      enableLogging: false,
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
      connectionTimeout: 15000,
      maxReconnectAttempts: 100,
      reconnectDelay: 2000,
      ...config,
    };

    this.logger = new Logger(
      'TransportManager',
      this.config.enableLogging ? LogLevel.DEBUG : LogLevel.NONE,
    );

    // Initialize transports
    this.wsTransport = new WebSocketTransport({
      url: this.config.websocketUrl,
      enableSFU: this.config.enableSFU,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      reconnectDelay: this.config.reconnectDelay,
      connectionTimeout: this.config.connectionTimeout,
      enableLogging: this.config.enableLogging,
    });

    this.rtcTransport = new WebRTCTransport({
      iceServers: this.config.iceServers,
      enableDataChannel: true,
      connectionTimeout: this.config.connectionTimeout,
      enableLogging: this.config.enableLogging,
    });

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for both transports
   */
  private setupEventHandlers(): void {
    // WebSocket events
    this.wsTransport.on('connected', () => {
      this.logger.info('WebSocket connected');
    });

    this.wsTransport.on('disconnected', ({ reason }) => {
      this.logger.warn('WebSocket disconnected', { reason });
      this.handleDisconnection(reason);
    });

    this.wsTransport.on('message', (message) => {
      this.handleWebSocketMessage(message);
    });

    this.wsTransport.on('error', ({ error }) => {
      this.logger.error('WebSocket error', { error });
      this.emit('error', { error });
    });

    // WebRTC events
    this.rtcTransport.on('connected', () => {
      this.logger.info('WebRTC connected');
      this.isConnected = true;
      this.isConnecting = false;
      this.emit('connected', undefined);
    });

    this.rtcTransport.on('disconnected', () => {
      this.logger.warn('WebRTC disconnected');
      this.handleDisconnection('WebRTC connection lost');
    });

    this.rtcTransport.on('track', ({ track, streams }) => {
      this.logger.info('WebRTC track received', { kind: track.kind });
      this.emit('track', { track, streams });
    });

    this.rtcTransport.on('error', ({ error }) => {
      this.logger.error('WebRTC error', { error });
      this.emit('error', { error });
    });

    this.rtcTransport.on('iceCandidate', ({ candidate }) => {
      this.logger.debug('ICE candidate', { candidate: candidate.candidate });
      // In trickle ICE, we would send candidates via WebSocket here
      // For now, we wait for gathering to complete before sending offer
    });
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(message: WebSocketMessage): void {
    this.logger.debug('WebSocket message', { message });

    // Handle protocol messages
    if ('type' in message) {
      switch (message.type) {
        case 'speak':
          this.emit('speaking', undefined);
          break;

        case 'silent':
          this.emit('silent', undefined);
          break;

        case 'answer':
          // Handle SDP answer from server
          this.handleSdpAnswer(message);
          break;

        case 'missing_session_token':
          this.logger.error('Missing session token');
          this.emit('error', { error: new Error('Missing session token') });
          break;

        default:
          // Forward other messages to application
          this.emit('message', message);
      }
    } else {
      // Forward unknown messages
      this.emit('message', message);
    }
  }

  /**
   * Handle SDP answer from server
   */
  private async handleSdpAnswer(message: any): Promise<void> {
    try {
      this.logger.info('Setting remote SDP answer');
      await this.rtcTransport.setRemoteDescription({
        type: 'answer',
        sdp: message.sdp,
      });
    } catch (error) {
      this.logger.error('Failed to set remote description', { error });
      this.emit('error', { error: error as Error });
    }
  }

  /**
   * Connect both transports
   */
  public async connect(sessionToken?: string): Promise<void> {
    if (this.isConnecting || this.isConnected) {
      this.logger.warn('Already connecting or connected');
      return;
    }

    this.isConnecting = true;

    try {
      this.logger.info('Starting connection process');

      // Step 1: Create WebRTC peer connection and setup transceivers
      await this.rtcTransport.createPeerConnection();
      
      // Add transceivers for receiving audio and video
      this.rtcTransport.addTransceiver('audio', { direction: 'recvonly' });
      this.rtcTransport.addTransceiver('video', { direction: 'recvonly' });

      // Step 2: Create SDP offer
      const offer = await this.rtcTransport.createOffer();
      this.logger.info('Created SDP offer');

      // Step 3: Connect WebSocket and send offer
      await this.wsTransport.connect(offer, sessionToken);
      this.logger.info('WebSocket connected, waiting for answer...');

      // The answer will be received via WebSocket message and handled
      // by handleSdpAnswer()
    } catch (error) {
      this.isConnecting = false;
      this.logger.error('Connection failed', { error });
      throw error;
    }
  }

  /**
   * Send audio data via WebSocket
   */
  public sendAudioData(data: Uint8Array): void {
    if (!this.isConnected) {
      this.logger.warn('Not connected, cannot send audio data');
      return;
    }

    this.wsTransport.send(data, { priority: 'high', queueIfOffline: true });
  }

  /**
   * Send audio data immediately (with PLAY_IMMEDIATE prefix)
   */
  public sendAudioDataImmediate(data: Uint8Array): void {
    if (!this.isConnected) {
      this.logger.warn('Not connected, cannot send audio data');
      return;
    }

    const prefix = 'PLAY_IMMEDIATE';
    const encoder = new TextEncoder();
    const prefixBytes = encoder.encode(prefix);

    const buffer = new Uint8Array(prefixBytes.length + data.length);
    buffer.set(prefixBytes, 0);
    buffer.set(data, prefixBytes.length);

    this.wsTransport.send(buffer, { priority: 'high', queueIfOffline: false });
  }

  /**
   * Clear audio buffer
   */
  public clearBuffer(): void {
    this.wsTransport.clearBuffer();
  }

  /**
   * Send ping via WebSocket
   */
  public sendPing(): void {
    this.wsTransport.sendPing();
  }

  /**
   * Set session token (for sending after connection)
   */
  public setSessionToken(token: string): void {
    this.wsTransport.setSessionToken(token);
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(reason: string): void {
    if (!this.isConnected) return;

    this.isConnected = false;
    this.isConnecting = false;

    this.logger.warn('Disconnected', { reason });
    this.emit('disconnected', { reason });
  }

  /**
   * Check if connected
   */
  public isTransportConnected(): boolean {
    return this.isConnected && 
           this.wsTransport.isConnected() && 
           this.rtcTransport.isConnected();
  }

  /**
   * Get WebSocket transport (for advanced usage)
   */
  public getWebSocketTransport(): WebSocketTransport {
    return this.wsTransport;
  }

  /**
   * Get WebRTC transport (for advanced usage)
   */
  public getWebRTCTransport(): WebRTCTransport {
    return this.rtcTransport;
  }

  /**
   * Close both transports
   */
  public async close(): Promise<void> {
    this.logger.info('Closing transports');

    // Send DONE signal
    this.wsTransport.sendDone();

    // Close transports
    this.wsTransport.close();
    await this.rtcTransport.close();

    this.isConnected = false;
    this.isConnecting = false;
  }

  /**
   * Destroy transport manager and cleanup
   */
  public destroy(): void {
    this.close();
    this.wsTransport.destroy();
    this.rtcTransport.destroy();
    this.removeAllListeners();
    this.logger.info('Transport manager destroyed');
  }

  /**
   * Get connection statistics
   */
  public getStats(): {
    websocket: ReturnType<WebSocketTransport['getStats']>;
    webrtc: ReturnType<WebRTCTransport['getConnectionInfo']>;
    isConnected: boolean;
    isConnecting: boolean;
  } {
    return {
      websocket: this.wsTransport.getStats(),
      webrtc: this.rtcTransport.getConnectionInfo(),
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
    };
  }
}
