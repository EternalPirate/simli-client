/**
 * Simli Client V2
 * 
 * Modern, modular WebRTC-based avatar client with:
 * - Clean, Promise-based API
 * - Full TypeScript support
 * - Comprehensive state management
 * - Automatic reconnection
 * - Type-safe events
 */

import { EventEmitter } from './utils/EventEmitter';
import { Logger, LogLevel } from './utils/Logger';
import { ConnectionManager } from './core/ConnectionManager';
import { StateManager } from './core/StateManager';
import { ConfigValidator } from './core/ConfigValidator';
import { TransportManager } from './transport/TransportManager';
import { AudioStreamManager } from './audio/AudioStreamManager';
import { MediaStreamManager } from './media/MediaStreamManager';
import { SessionManager } from './session/SessionManager';
import { SimliConfig } from './types/config.types';
import { ConnectionStateType } from './types/state.types';

/**
 * Simli Client V2 Events
 */
export interface SimliClientV2Events {
  // Connection events
  connected: void;
  disconnected: { reason: string };
  reconnecting: { attempt: number };
  
  // Session events
  sessionStarted: { sessionId: string };
  sessionEnded: { sessionId: string; duration: number };
  
  // Media events
  videoReady: void;
  audioReady: void;
  firstFrame: void;
  
  // Avatar state events
  speaking: void;
  silent: void;
  
  // Error events
  error: { error: Error; context?: string };
  
  // State change
  stateChange: { state: ConnectionStateType };
}

/**
 * Simli Client V2 Configuration
 */
export interface SimliClientV2Config {
  // Required
  apiKey: string;
  faceID: string;
  videoElement: HTMLVideoElement;
  audioElement: HTMLAudioElement;
  
  // Optional
  sessionToken?: string;
  model?: 'fasttalk' | 'artalk';
  handleSilence?: boolean;
  maxSessionLength?: number;
  maxIdleTime?: number;
  maxRetryAttempts?: number;
  retryDelay?: number;
  enableSFU?: boolean;
  simliURL?: string;
  enableLogging?: boolean;
}

/**
 * Simli Client V2
 * 
 * Modern avatar client built on modular architecture.
 */
export class SimliClientV2 extends EventEmitter<SimliClientV2Events> {
  private logger: Logger;
  private config: Required<SimliClientV2Config>;
  
  // Core modules
  private connectionManager: ConnectionManager;
  private stateManager: StateManager;
  private sessionManager: SessionManager;
  
  // Media modules
  private mediaManager: MediaStreamManager;
  private audioStreamManager: AudioStreamManager | null = null;
  
  // State
  private isInitialized = false;
  
  constructor(config: SimliClientV2Config) {
    super();
    
    // Normalize config with defaults
    this.config = {
      sessionToken: '',
      model: 'artalk',
      handleSilence: true,
      maxSessionLength: 3600,
      maxIdleTime: 600,
      maxRetryAttempts: 100,
      retryDelay: 2000,
      enableSFU: true,
      simliURL: 's://api.simli.ai',
      enableLogging: false,
      ...config,
    };
    
    // Setup logger
    this.logger = new Logger(
      'SimliClientV2',
      this.config.enableLogging ? LogLevel.DEBUG : LogLevel.NONE,
    );
    
    // Validate configuration
    this.validateConfig();
    
    // Initialize core modules
    this.stateManager = new StateManager({
      enableLogging: this.config.enableLogging,
    });
    
    this.connectionManager = new ConnectionManager({
      apiKey: this.config.apiKey,
      faceID: this.config.faceID,
      handleSilence: this.config.handleSilence,
      maxSessionLength: this.config.maxSessionLength,
      maxIdleTime: this.config.maxIdleTime,
      session_token: this.config.sessionToken,
      videoRef: this.config.videoElement,
      audioRef: this.config.audioElement,
      enableConsoleLogs: this.config.enableLogging,
      SimliURL: this.config.simliURL,
      maxRetryAttempts: this.config.maxRetryAttempts,
      retryDelay_ms: this.config.retryDelay,
      videoReceivedTimeout: 15000,
      enableSFU: this.config.enableSFU,
      model: this.config.model,
    });
    
    this.sessionManager = new SessionManager({
      faceId: this.config.faceID,
      model: this.config.model,
      maxSessionLength: this.config.maxSessionLength,
      maxIdleTime: this.config.maxIdleTime,
      enableLogging: this.config.enableLogging,
    });
    
    this.mediaManager = new MediaStreamManager({
      enableLogging: this.config.enableLogging,
    });
    
    // Attach media elements
    this.mediaManager.attachVideoElement(this.config.videoElement);
    this.mediaManager.attachAudioElement(this.config.audioElement);
    
    // Setup event listeners
    this.setupEventListeners();
    
    this.isInitialized = true;
    this.logger.info('SimliClientV2 initialized', {
      faceID: this.config.faceID,
      model: this.config.model,
    });
  }
  
  /**
   * Validate configuration
   */
  private validateConfig(): void {
    const result = ConfigValidator.validateLegacyConfig(this.config);
    
    if (!result.valid) {
      const errorMessages = result.errors.map((e) => e.message).join('; ');
      throw new Error(`Invalid configuration: ${errorMessages}`);
    }
    
    result.warnings.forEach((warning) => {
      this.logger.warn(warning);
    });
  }
  
  /**
   * Setup event listeners for all modules
   */
  private setupEventListeners(): void {
    // Connection manager events
    this.connectionManager.on('connected', () => {
      this.logger.info('Connected');
      this.stateManager.setConnectionState('connected');
      this.stateManager.setSessionState('active');
      this.emit('connected', undefined);
    });
    
    this.connectionManager.on('disconnected', (data) => {
      this.logger.warn('Disconnected', data);
      this.stateManager.setConnectionState('disconnected');
      this.emit('disconnected', data);
    });
    
    this.connectionManager.on('reconnecting', (data) => {
      this.logger.info('Reconnecting', data);
      this.stateManager.setConnectionState('reconnecting');
      this.emit('reconnecting', data);
    });
    
    this.connectionManager.on('error', (data) => {
      this.logger.error('Connection error', data);
      this.emit('error', { ...data, context: 'connection' });
    });
    
    this.connectionManager.on('sessionInitialized', (data) => {
      this.logger.info('Session initialized', data);
      this.sessionManager.createSession(data.sessionToken);
    });
    
    // Session manager events
    this.sessionManager.on('sessionStarted', (data) => {
      this.logger.info('Session started', data);
      this.emit('sessionStarted', data);
    });
    
    this.sessionManager.on('sessionEnded', (data) => {
      this.logger.info('Session ended', data);
      this.emit('sessionEnded', data);
    });
    
    // Media manager events
    this.mediaManager.on('videoReady', () => {
      this.logger.info('Video ready');
      this.stateManager.setVideoState('ready');
      this.emit('videoReady', undefined);
    });
    
    this.mediaManager.on('videoPlaying', () => {
      this.logger.info('Video playing');
      this.stateManager.setVideoState('streaming');
      this.emit('firstFrame', undefined);
    });
    
    this.mediaManager.on('audioReady', () => {
      this.logger.info('Audio ready');
      this.stateManager.setAudioState('ready');
      this.emit('audioReady', undefined);
    });
    
    this.mediaManager.on('error', (data) => {
      this.logger.error('Media error', data);
      this.emit('error', { ...data, context: 'media' });
    });
  }
  
  /**
   * Connect to Simli service
   */
  public async connect(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Client not initialized');
    }
    
    if (this.stateManager.isConnected()) {
      this.logger.warn('Already connected');
      return;
    }
    
    this.logger.info('Connecting...');
    this.stateManager.setConnectionState('connecting');
    
    try {
      // Connect via connection manager
      await this.connectionManager.connect();
      
      // Get transport manager and setup media
      const transportManager = this.connectionManager.getTransportManager();
      if (!transportManager) {
        throw new Error('Transport manager not available');
      }
      
      // Setup transport event listeners for media and messages
      this.setupTransportListeners(transportManager);
      
      // Start session
      this.sessionManager.startSession();
      
    } catch (error) {
      this.logger.error('Connection failed', { error });
      this.stateManager.setConnectionState('failed');
      throw error;
    }
  }
  
  /**
   * Setup transport event listeners
   */
  private setupTransportListeners(transportManager: TransportManager): void {
    // Handle incoming media tracks
    transportManager.on('track', (data) => {
      this.logger.info('Media track received', { kind: data.track.kind });
      this.mediaManager.attachTrack(data.track, data.streams);
    });
    
    // Handle speaking/silent events
    transportManager.on('speaking', () => {
      this.logger.info('Avatar speaking');
      this.emit('speaking', undefined);
    });
    
    transportManager.on('silent', () => {
      this.logger.info('Avatar silent');
      this.emit('silent', undefined);
    });
    
    // Handle transport errors
    transportManager.on('error', (data) => {
      this.logger.error('Transport error', data);
      this.emit('error', { ...data, context: 'transport' });
    });
  }
  
  /**
   * Start capturing audio from microphone
   */
  public async startAudioCapture(): Promise<void> {
    this.logger.info('Starting audio capture');
    
    // Create audio stream manager if not exists
    if (!this.audioStreamManager) {
      this.audioStreamManager = new AudioStreamManager({
        sampleRate: 16000,
        bufferSize: 3000,
        enableLogging: this.config.enableLogging,
      });
      
      // Setup audio data handler
      this.audioStreamManager.on('audioData', (data) => {
        this.sendAudioData(data.data);
      });
      
      this.audioStreamManager.on('error', (data) => {
        this.logger.error('Audio stream error', data);
        this.emit('error', { ...data, context: 'audio' });
      });
    }
    
    // Start capturing (AudioStreamManager handles processor internally)
    await this.audioStreamManager.start();
    
    this.stateManager.setAudioState('streaming');
    this.logger.info('Audio capture started');
  }
  
  /**
   * Stop audio capture
   */
  public stopAudioCapture(): void {
    this.logger.info('Stopping audio capture');
    
    if (this.audioStreamManager) {
      this.audioStreamManager.stop();
    }
    
    this.stateManager.setAudioState('stopped');
  }
  
  /**
   * Send audio data to avatar
   */
  public sendAudioData(data: Uint8Array, immediate = false): void {
    const transportManager = this.connectionManager.getTransportManager();
    if (!transportManager) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }
    
    if (immediate) {
      transportManager.sendAudioDataImmediate(data);
    } else {
      transportManager.sendAudioData(data);
    }
    
    // Update session stats
    this.sessionManager.addBytesSent(data.length);
    this.sessionManager.incrementAudioPackets();
  }
  
  /**
   * Clear audio buffer
   */
  public clearBuffer(): void {
    const transportManager = this.connectionManager.getTransportManager();
    if (transportManager) {
      transportManager.clearBuffer();
      this.logger.info('Buffer cleared');
    }
  }
  
  /**
   * Disconnect from Simli service
   */
  public async disconnect(): Promise<void> {
    this.logger.info('Disconnecting...');
    
    // Stop audio capture
    this.stopAudioCapture();
    
    // End session
    this.sessionManager.endSession();
    
    // Disconnect connection manager
    await this.connectionManager.disconnect();
    
    // Update state
    this.stateManager.setConnectionState('disconnected');
    this.stateManager.setSessionState('ended');
    
    this.logger.info('Disconnected');
  }
  
  /**
   * Destroy client and cleanup all resources
   */
  public async destroy(): Promise<void> {
    this.logger.info('Destroying client...');
    
    // Disconnect if connected
    if (this.stateManager.isConnected()) {
      await this.disconnect();
    }
    
    // Destroy all modules
    this.audioStreamManager?.destroy();
    this.mediaManager.destroy();
    this.sessionManager.destroy();
    this.connectionManager.destroy();
    this.stateManager.destroy();
    
    // Remove all event listeners
    this.removeAllListeners();
    
    this.isInitialized = false;
    this.logger.info('Client destroyed');
  }
  
  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.stateManager.isConnected();
  }
  
  /**
   * Get current state
   */
  public getState(): ConnectionStateType {
    return this.stateManager.getConnectionState();
  }
  
  /**
   * Get session info
   */
  public getSessionInfo(): ReturnType<SessionManager['getSummary']> {
    return this.sessionManager.getSummary();
  }
  
  /**
   * Get connection statistics
   */
  public getStats(): {
    connection: ReturnType<ConnectionManager['getConnectionInfo']>;
    session: ReturnType<SessionManager['getSummary']>;
    media: ReturnType<MediaStreamManager['getInfo']>;
    state: ReturnType<StateManager['getState']>;
  } {
    return {
      connection: this.connectionManager.getConnectionInfo(),
      session: this.sessionManager.getSummary(),
      media: this.mediaManager.getInfo(),
      state: this.stateManager.getState(),
    };
  }
}
