/**
 * Audio Processor
 * 
 * Handles audio processing with:
 * - PCM16 encoding
 * - Audio worklet integration
 * - Buffer management
 * - Real-time audio capture
 */

import { EventEmitter } from '../utils/EventEmitter';
import { Logger, LogLevel } from '../utils/Logger';

/**
 * Audio Processor Events
 */
export interface AudioProcessorEvents {
  audioData: { data: Uint8Array };
  error: { error: Error };
  stateChange: { state: AudioProcessorState };
}

/**
 * Audio processor state
 */
export type AudioProcessorState = 'idle' | 'initializing' | 'processing' | 'stopped' | 'error';

/**
 * Audio Processor Configuration
 */
export interface AudioProcessorConfig {
  sampleRate?: number;
  bufferSize?: number;
  enableLogging?: boolean;
}

/**
 * Audio Worklet Processor Code
 * 
 * This code runs in the audio worklet thread.
 */
const AUDIO_WORKLET_CODE = (bufferSize: number) => `
  class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.buffer = new Int16Array(${bufferSize});
      this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
      const input = inputs[0];
      const inputChannel = input[0];
      
      if (inputChannel) {
        for (let i = 0; i < inputChannel.length; i++) {
          // Convert float32 to int16
          this.buffer[this.bufferIndex] = Math.max(
            -32768,
            Math.min(32767, Math.round(inputChannel[i] * 32767))
          );
          this.bufferIndex++;

          if (this.bufferIndex === this.buffer.length) {
            // Send buffer to main thread
            this.port.postMessage({
              type: 'audioData',
              data: this.buffer.slice(0, this.bufferIndex)
            });
            this.bufferIndex = 0;
          }
        }
      }
      
      return true;
    }
  }

  registerProcessor('audio-processor', AudioProcessor);
`;

/**
 * Audio Processor
 * 
 * Captures and processes audio from a MediaStreamTrack.
 */
export class AudioProcessor extends EventEmitter<AudioProcessorEvents> {
  private logger: Logger;
  private state: AudioProcessorState = 'idle';
  private config: Required<AudioProcessorConfig>;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private inputTrack: MediaStreamTrack | null = null;

  constructor(config: AudioProcessorConfig = {}) {
    super();

    this.config = {
      sampleRate: 16000,
      bufferSize: 3000,
      enableLogging: false,
      ...config,
    };

    this.logger = new Logger(
      'AudioProcessor',
      this.config.enableLogging ? LogLevel.DEBUG : LogLevel.NONE,
    );
  }

  /**
   * Get current state
   */
  public getState(): AudioProcessorState {
    return this.state;
  }

  /**
   * Initialize audio processing for a media stream track
   */
  public async initialize(track: MediaStreamTrack): Promise<void> {
    if (this.state === 'processing') {
      this.logger.warn('Already processing, stopping first...');
      this.stop();
    }

    this.setState('initializing');
    this.inputTrack = track;

    try {
      // Create audio context with desired sample rate
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate,
      });

      this.logger.info('Audio context created', {
        sampleRate: this.audioContext.sampleRate,
      });

      // Load audio worklet
      await this.loadAudioWorklet();

      // Create source from track
      const stream = new MediaStream([track]);
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // Connect source to worklet
      this.sourceNode.connect(this.workletNode!);

      this.setState('processing');
      this.logger.info('Audio processing started');
    } catch (error) {
      this.logger.error('Failed to initialize audio processor', { error });
      this.setState('error');
      this.emit('error', { error: error as Error });
      throw error;
    }
  }

  /**
   * Load and initialize audio worklet
   */
  private async loadAudioWorklet(): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }

    // Create worklet code blob
    const workletCode = AUDIO_WORKLET_CODE(this.config.bufferSize);
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);

    try {
      // Add audio worklet module
      await this.audioContext.audioWorklet.addModule(workletUrl);

      // Create worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

      // Setup message handler
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audioData') {
          const audioData = new Uint8Array(event.data.data.buffer);
          this.emit('audioData', { data: audioData });
        }
      };

      this.logger.info('Audio worklet loaded');
    } finally {
      // Clean up blob URL
      URL.revokeObjectURL(workletUrl);
    }
  }

  /**
   * Stop audio processing
   */
  public stop(): void {
    this.logger.info('Stopping audio processor');

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode.port.close();
      this.workletNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.inputTrack = null;
    this.setState('stopped');
  }

  /**
   * Destroy audio processor
   */
  public destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.logger.info('Audio processor destroyed');
  }

  /**
   * Set audio processor state
   */
  private setState(state: AudioProcessorState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', { state });
      this.logger.debug('State changed', { state });
    }
  }

  /**
   * Get audio context info
   */
  public getInfo(): {
    state: AudioProcessorState;
    sampleRate: number | null;
    currentTime: number | null;
    hasTrack: boolean;
  } {
    return {
      state: this.state,
      sampleRate: this.audioContext?.sampleRate || null,
      currentTime: this.audioContext?.currentTime || null,
      hasTrack: !!this.inputTrack,
    };
  }
}
