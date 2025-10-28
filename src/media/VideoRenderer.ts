/**
 * Video Renderer
 * 
 * Manages video rendering with:
 * - HTMLVideoElement management
 * - Stream attachment
 * - Playback control
 * - Event handling
 */

import { EventEmitter } from '../utils/EventEmitter';
import { Logger, LogLevel } from '../utils/Logger';

/**
 * Video Renderer Events
 */
export interface VideoRendererEvents {
  ready: void;
  playing: void;
  paused: void;
  ended: void;
  error: { error: Error };
  stateChange: { state: VideoRendererState };
  firstFrame: void;
}

/**
 * Video renderer state
 */
export type VideoRendererState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

/**
 * Video Renderer Configuration
 */
export interface VideoRendererConfig {
  autoplay?: boolean;
  muted?: boolean;
  enableLogging?: boolean;
}

/**
 * Video Renderer
 * 
 * Manages video playback in an HTMLVideoElement.
 */
export class VideoRenderer extends EventEmitter<VideoRendererEvents> {
  private logger: Logger;
  private state: VideoRendererState = 'idle';
  private config: Required<VideoRendererConfig>;
  private videoElement: HTMLVideoElement | null = null;
  private currentStream: MediaStream | null = null;
  private hasReceivedFirstFrame = false;

  constructor(config: VideoRendererConfig = {}) {
    super();

    this.config = {
      autoplay: true,
      muted: false,
      enableLogging: false,
      ...config,
    };

    this.logger = new Logger(
      'VideoRenderer',
      this.config.enableLogging ? LogLevel.DEBUG : LogLevel.NONE,
    );
  }

  /**
   * Get current state
   */
  public getState(): VideoRendererState {
    return this.state;
  }

  /**
   * Attach video element
   */
  public attachElement(videoElement: HTMLVideoElement): void {
    if (!(videoElement instanceof HTMLVideoElement)) {
      throw new Error('videoElement must be an HTMLVideoElement');
    }

    this.logger.info('Attaching video element');

    // Detach previous element if any
    if (this.videoElement) {
      this.detachElement();
    }

    this.videoElement = videoElement;
    this.setupEventListeners();

    // Apply config
    this.videoElement.autoplay = this.config.autoplay;
    this.videoElement.muted = this.config.muted;

    this.logger.info('Video element attached');
  }

  /**
   * Detach video element
   */
  public detachElement(): void {
    if (!this.videoElement) return;

    this.logger.info('Detaching video element');

    this.removeEventListeners();
    this.videoElement.srcObject = null;
    this.videoElement = null;
    this.currentStream = null;
    this.setState('idle');
  }

  /**
   * Setup video element event listeners
   */
  private setupEventListeners(): void {
    if (!this.videoElement) return;

    this.videoElement.addEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.videoElement.addEventListener('canplay', this.handleCanPlay);
    this.videoElement.addEventListener('playing', this.handlePlaying);
    this.videoElement.addEventListener('pause', this.handlePause);
    this.videoElement.addEventListener('ended', this.handleEnded);
    this.videoElement.addEventListener('error', this.handleError);

    // Request video frame callback for first frame detection
    if (this.videoElement.requestVideoFrameCallback) {
      this.videoElement.requestVideoFrameCallback(() => this.handleFirstFrame());
    }
  }

  /**
   * Remove video element event listeners
   */
  private removeEventListeners(): void {
    if (!this.videoElement) return;

    this.videoElement.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.videoElement.removeEventListener('canplay', this.handleCanPlay);
    this.videoElement.removeEventListener('playing', this.handlePlaying);
    this.videoElement.removeEventListener('pause', this.handlePause);
    this.videoElement.removeEventListener('ended', this.handleEnded);
    this.videoElement.removeEventListener('error', this.handleError);
  }

  /**
   * Handle loaded metadata event
   */
  private handleLoadedMetadata = (): void => {
    this.logger.info('Video metadata loaded', {
      width: this.videoElement?.videoWidth,
      height: this.videoElement?.videoHeight,
      duration: this.videoElement?.duration,
    });
  };

  /**
   * Handle can play event
   */
  private handleCanPlay = (): void => {
    this.logger.info('Video can play');
    this.setState('ready');
    this.emit('ready', undefined);
  };

  /**
   * Handle playing event
   */
  private handlePlaying = (): void => {
    this.logger.info('Video playing');
    this.setState('playing');
    this.emit('playing', undefined);
  };

  /**
   * Handle pause event
   */
  private handlePause = (): void => {
    this.logger.info('Video paused');
    this.setState('paused');
    this.emit('paused', undefined);
  };

  /**
   * Handle ended event
   */
  private handleEnded = (): void => {
    this.logger.info('Video ended');
    this.setState('ended');
    this.emit('ended', undefined);
  };

  /**
   * Handle error event
   */
  private handleError = (event: Event): void => {
    const error = new Error(`Video error: ${this.videoElement?.error?.message || 'Unknown error'}`);
    this.logger.error('Video error', { error, event });
    this.setState('error');
    this.emit('error', { error });
  };

  /**
   * Handle first frame
   */
  private handleFirstFrame(): void {
    if (!this.hasReceivedFirstFrame) {
      this.hasReceivedFirstFrame = true;
      this.logger.info('First video frame received');
      this.emit('firstFrame', undefined);
    }
  }

  /**
   * Attach media stream
   */
  public attachStream(stream: MediaStream): void {
    if (!this.videoElement) {
      throw new Error('Video element not attached');
    }

    this.logger.info('Attaching media stream', {
      trackCount: stream.getTracks().length,
    });

    this.setState('loading');
    this.hasReceivedFirstFrame = false;
    this.currentStream = stream;
    this.videoElement.srcObject = stream;

    // Setup first frame callback
    if (this.videoElement.requestVideoFrameCallback) {
      this.videoElement.requestVideoFrameCallback(() => this.handleFirstFrame());
    }
  }

  /**
   * Detach media stream
   */
  public detachStream(): void {
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.currentStream = null;
    this.hasReceivedFirstFrame = false;
    this.setState('idle');
  }

  /**
   * Play video
   */
  public async play(): Promise<void> {
    if (!this.videoElement) {
      throw new Error('Video element not attached');
    }

    try {
      await this.videoElement.play();
      this.logger.info('Video playback started');
    } catch (error) {
      this.logger.error('Failed to play video', { error });
      this.emit('error', { error: error as Error });
      throw error;
    }
  }

  /**
   * Pause video
   */
  public pause(): void {
    if (!this.videoElement) {
      throw new Error('Video element not attached');
    }

    this.videoElement.pause();
    this.logger.info('Video paused');
  }

  /**
   * Get video element
   */
  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Get current stream
   */
  public getStream(): MediaStream | null {
    return this.currentStream;
  }

  /**
   * Check if first frame received
   */
  public hasFirstFrame(): boolean {
    return this.hasReceivedFirstFrame;
  }

  /**
   * Destroy video renderer
   */
  public destroy(): void {
    this.detachStream();
    this.detachElement();
    this.removeAllListeners();
    this.logger.info('Video renderer destroyed');
  }

  /**
   * Set video renderer state
   */
  private setState(state: VideoRendererState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', { state });
      this.logger.debug('State changed', { state });
    }
  }

  /**
   * Get renderer info
   */
  public getInfo(): {
    state: VideoRendererState;
    hasElement: boolean;
    hasStream: boolean;
    hasFirstFrame: boolean;
    videoWidth: number | null;
    videoHeight: number | null;
    currentTime: number | null;
    duration: number | null;
    paused: boolean | null;
  } {
    return {
      state: this.state,
      hasElement: !!this.videoElement,
      hasStream: !!this.currentStream,
      hasFirstFrame: this.hasReceivedFirstFrame,
      videoWidth: this.videoElement?.videoWidth || null,
      videoHeight: this.videoElement?.videoHeight || null,
      currentTime: this.videoElement?.currentTime || null,
      duration: this.videoElement?.duration || null,
      paused: this.videoElement?.paused || null,
    };
  }
}
