/**
 * Audio Stream Manager
 * 
 * Manages audio stream lifecycle with:
 * - MediaStream creation and management
 * - Audio track handling
 * - Processor integration
 * - Stream state management
 */

import { EventEmitter } from '../utils/EventEmitter';
import { Logger, LogLevel } from '../utils/Logger';
import { AudioProcessor, AudioProcessorEvents } from './AudioProcessor';

/**
 * Audio Stream Manager Events
 */
export interface AudioStreamManagerEvents {
  streamReady: { stream: MediaStream };
  audioData: { data: Uint8Array };
  stateChange: { state: AudioStreamState };
  error: { error: Error };
}

/**
 * Audio stream state
 */
export type AudioStreamState = 'idle' | 'requesting' | 'active' | 'paused' | 'stopped' | 'error';

/**
 * Audio Stream Manager Configuration
 */
export interface AudioStreamManagerConfig {
  sampleRate?: number;
  bufferSize?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  enableLogging?: boolean;
}

/**
 * Audio Stream Manager
 * 
 * Manages the complete audio capture pipeline.
 */
export class AudioStreamManager extends EventEmitter<AudioStreamManagerEvents> {
  private logger: Logger;
  private state: AudioStreamState = 'idle';
  private config: Required<AudioStreamManagerConfig>;
  private mediaStream: MediaStream | null = null;
  private audioProcessor: AudioProcessor | null = null;
  private audioTrack: MediaStreamTrack | null = null;

  constructor(config: AudioStreamManagerConfig = {}) {
    super();

    this.config = {
      sampleRate: 16000,
      bufferSize: 3000,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      enableLogging: false,
      ...config,
    };

    this.logger = new Logger(
      'AudioStreamManager',
      this.config.enableLogging ? LogLevel.DEBUG : LogLevel.NONE,
    );
  }

  /**
   * Get current state
   */
  public getState(): AudioStreamState {
    return this.state;
  }

  /**
   * Start audio capture
   */
  public async start(): Promise<MediaStream> {
    if (this.state === 'active') {
      this.logger.warn('Already active');
      return this.mediaStream!;
    }

    this.setState('requesting');

    try {
      // Request user media
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
          sampleRate: this.config.sampleRate,
        },
        video: false,
      };

      this.logger.info('Requesting user media', constraints);
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Get audio track
      this.audioTrack = this.mediaStream.getAudioTracks()[0];

      if (!this.audioTrack) {
        throw new Error('No audio track in media stream');
      }

      this.logger.info('Audio stream obtained', {
        trackId: this.audioTrack.id,
        label: this.audioTrack.label,
        settings: this.audioTrack.getSettings(),
      });

      // Initialize audio processor
      await this.initializeProcessor();

      this.setState('active');
      this.emit('streamReady', { stream: this.mediaStream });

      return this.mediaStream;
    } catch (error) {
      this.logger.error('Failed to start audio stream', { error });
      this.setState('error');
      this.emit('error', { error: error as Error });
      throw error;
    }
  }

  /**
   * Initialize audio processor
   */
  private async initializeProcessor(): Promise<void> {
    if (!this.audioTrack) {
      throw new Error('No audio track available');
    }

    // Create audio processor
    this.audioProcessor = new AudioProcessor({
      sampleRate: this.config.sampleRate,
      bufferSize: this.config.bufferSize,
      enableLogging: this.config.enableLogging,
    });

    // Forward audio data events
    this.audioProcessor.on('audioData', (data) => {
      this.emit('audioData', data);
    });

    // Forward error events
    this.audioProcessor.on('error', (data) => {
      this.logger.error('Audio processor error', data);
      this.emit('error', data);
    });

    // Initialize with audio track
    await this.audioProcessor.initialize(this.audioTrack);

    this.logger.info('Audio processor initialized');
  }

  /**
   * Stop audio capture
   */
  public stop(): void {
    this.logger.info('Stopping audio stream');

    if (this.audioProcessor) {
      this.audioProcessor.destroy();
      this.audioProcessor = null;
    }

    if (this.audioTrack) {
      this.audioTrack.stop();
      this.audioTrack = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.setState('stopped');
  }

  /**
   * Pause audio capture (mute track)
   */
  public pause(): void {
    if (this.audioTrack && this.state === 'active') {
      this.audioTrack.enabled = false;
      this.setState('paused');
      this.logger.info('Audio stream paused');
    }
  }

  /**
   * Resume audio capture (unmute track)
   */
  public resume(): void {
    if (this.audioTrack && this.state === 'paused') {
      this.audioTrack.enabled = true;
      this.setState('active');
      this.logger.info('Audio stream resumed');
    }
  }

  /**
   * Start from existing MediaStreamTrack
   */
  public async startFromTrack(track: MediaStreamTrack): Promise<void> {
    if (this.state === 'active') {
      this.logger.warn('Already active, stopping first...');
      this.stop();
    }

    this.setState('requesting');

    try {
      this.audioTrack = track;
      this.mediaStream = new MediaStream([track]);

      await this.initializeProcessor();

      this.setState('active');
      this.emit('streamReady', { stream: this.mediaStream });

      this.logger.info('Started from existing track');
    } catch (error) {
      this.logger.error('Failed to start from track', { error });
      this.setState('error');
      this.emit('error', { error: error as Error });
      throw error;
    }
  }

  /**
   * Get media stream
   */
  public getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  /**
   * Get audio track
   */
  public getAudioTrack(): MediaStreamTrack | null {
    return this.audioTrack;
  }

  /**
   * Get audio processor
   */
  public getAudioProcessor(): AudioProcessor | null {
    return this.audioProcessor;
  }

  /**
   * Destroy audio stream manager
   */
  public destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.logger.info('Audio stream manager destroyed');
  }

  /**
   * Set audio stream state
   */
  private setState(state: AudioStreamState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', { state });
      this.logger.debug('State changed', { state });
    }
  }

  /**
   * Get stream info
   */
  public getInfo(): {
    state: AudioStreamState;
    hasStream: boolean;
    hasTrack: boolean;
    trackSettings: MediaTrackSettings | null;
    processorInfo: ReturnType<AudioProcessor['getInfo']> | null;
  } {
    return {
      state: this.state,
      hasStream: !!this.mediaStream,
      hasTrack: !!this.audioTrack,
      trackSettings: this.audioTrack?.getSettings() || null,
      processorInfo: this.audioProcessor?.getInfo() || null,
    };
  }
}
