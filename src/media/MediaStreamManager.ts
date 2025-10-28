/**
 * Media Stream Manager
 * 
 * Manages complete media pipeline with:
 * - Audio stream management
 * - Video stream rendering
 * - Unified media control
 * - State coordination
 */

import { EventEmitter } from '../utils/EventEmitter';
import { Logger, LogLevel } from '../utils/Logger';
import { VideoRenderer, VideoRendererEvents } from './VideoRenderer';

/**
 * Media Stream Manager Events
 */
export interface MediaStreamManagerEvents {
  videoReady: void;
  videoPlaying: void;
  audioReady: { stream: MediaStream };
  stateChange: { state: MediaStreamState };
  error: { error: Error };
}

/**
 * Media stream state
 */
export type MediaStreamState = 'idle' | 'initializing' | 'ready' | 'active' | 'error';

/**
 * Media Stream Manager Configuration
 */
export interface MediaStreamManagerConfig {
  enableLogging?: boolean;
}

/**
 * Media Stream Manager
 * 
 * Coordinates video and audio streams.
 */
export class MediaStreamManager extends EventEmitter<MediaStreamManagerEvents> {
  private logger: Logger;
  private state: MediaStreamState = 'idle';
  private videoRenderer: VideoRenderer;
  private audioElement: HTMLAudioElement | null = null;
  private audioStream: MediaStream | null = null;

  constructor(config: MediaStreamManagerConfig = {}) {
    super();

    this.logger = new Logger(
      'MediaStreamManager',
      config.enableLogging ? LogLevel.DEBUG : LogLevel.NONE,
    );

    this.videoRenderer = new VideoRenderer({
      autoplay: true,
      muted: false,
      enableLogging: config.enableLogging,
    });

    this.setupVideoRendererListeners();
  }

  /**
   * Setup video renderer event listeners
   */
  private setupVideoRendererListeners(): void {
    this.videoRenderer.on('ready', () => {
      this.logger.info('Video ready');
      this.emit('videoReady', undefined);
    });

    this.videoRenderer.on('playing', () => {
      this.logger.info('Video playing');
      this.setState('active');
      this.emit('videoPlaying', undefined);
    });

    this.videoRenderer.on('error', (data) => {
      this.logger.error('Video error', data);
      this.setState('error');
      this.emit('error', data);
    });

    this.videoRenderer.on('firstFrame', () => {
      this.logger.info('First video frame received');
    });
  }

  /**
   * Get current state
   */
  public getState(): MediaStreamState {
    return this.state;
  }

  /**
   * Attach video element
   */
  public attachVideoElement(videoElement: HTMLVideoElement): void {
    this.logger.info('Attaching video element');
    this.videoRenderer.attachElement(videoElement);
  }

  /**
   * Attach audio element
   */
  public attachAudioElement(audioElement: HTMLAudioElement): void {
    if (!(audioElement instanceof HTMLAudioElement)) {
      throw new Error('audioElement must be an HTMLAudioElement');
    }

    this.logger.info('Attaching audio element');
    this.audioElement = audioElement;
  }

  /**
   * Attach video stream (from WebRTC)
   */
  public attachVideoStream(stream: MediaStream): void {
    this.logger.info('Attaching video stream');
    this.setState('initializing');
    this.videoRenderer.attachStream(stream);
  }

  /**
   * Attach audio stream (from WebRTC)
   */
  public attachAudioStream(stream: MediaStream): void {
    if (!this.audioElement) {
      this.logger.warn('Audio element not attached');
      return;
    }

    this.logger.info('Attaching audio stream');
    this.audioElement.srcObject = stream;
    this.audioStream = stream;
    this.emit('audioReady', { stream });
  }

  /**
   * Attach media tracks from WebRTC track event
   */
  public attachTrack(track: MediaStreamTrack, streams: MediaStream[]): void {
    this.logger.info('Attaching media track', {
      kind: track.kind,
      id: track.id,
    });

    if (streams.length === 0) {
      this.logger.warn('No streams provided with track');
      return;
    }

    const stream = streams[0];

    if (track.kind === 'video') {
      this.attachVideoStream(stream);
    } else if (track.kind === 'audio') {
      this.attachAudioStream(stream);
    }
  }

  /**
   * Detach all media
   */
  public detach(): void {
    this.logger.info('Detaching all media');

    this.videoRenderer.detachStream();

    if (this.audioElement) {
      this.audioElement.srcObject = null;
    }

    this.audioStream = null;
    this.setState('idle');
  }

  /**
   * Get video renderer
   */
  public getVideoRenderer(): VideoRenderer {
    return this.videoRenderer;
  }

  /**
   * Get audio element
   */
  public getAudioElement(): HTMLAudioElement | null {
    return this.audioElement;
  }

  /**
   * Destroy media stream manager
   */
  public destroy(): void {
    this.detach();
    this.videoRenderer.destroy();
    this.removeAllListeners();
    this.logger.info('Media stream manager destroyed');
  }

  /**
   * Set media stream state
   */
  private setState(state: MediaStreamState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', { state });
      this.logger.debug('State changed', { state });
    }
  }

  /**
   * Get media info
   */
  public getInfo(): {
    state: MediaStreamState;
    hasAudioElement: boolean;
    hasAudioStream: boolean;
    videoInfo: ReturnType<VideoRenderer['getInfo']>;
  } {
    return {
      state: this.state,
      hasAudioElement: !!this.audioElement,
      hasAudioStream: !!this.audioStream,
      videoInfo: this.videoRenderer.getInfo(),
    };
  }
}
