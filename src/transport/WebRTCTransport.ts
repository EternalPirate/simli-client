/**
 * WebRTC Transport Layer
 * 
 * Handles WebRTC peer connection management with:
 * - RTCPeerConnection setup and teardown
 * - ICE candidate gathering and handling
 * - Data channel management
 * - Media track handling (audio/video)
 * - Connection state monitoring
 * - Automatic reconnection
 */

import { EventEmitter } from '../utils/EventEmitter';
import { Logger, LogLevel } from '../utils/Logger';
import { TimeoutController } from '../utils/TimeoutController';
import { SDPMessage, ICECandidateMessage } from '../types/protocol.types';

/**
 * WebRTC connection states
 */
export type WebRTCState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/**
 * WebRTC-specific events
 */
export interface WebRTCEvents {
  stateChange: { state: WebRTCState };
  iceCandidate: { candidate: RTCIceCandidate };
  iceGatheringComplete: void;
  track: { track: MediaStreamTrack; streams: MediaStream[] };
  dataChannelOpen: void;
  dataChannelClose: void;
  dataChannelMessage: { data: string | ArrayBuffer };
  error: { error: Error };
  connected: void;
  disconnected: void;
}

/**
 * WebRTC Transport Configuration
 */
export interface WebRTCTransportConfig {
  iceServers?: RTCIceServer[];
  enableDataChannel?: boolean;
  dataChannelConfig?: RTCDataChannelInit;
  gatheringTimeout?: number;
  connectionTimeout?: number;
  enableLogging?: boolean;
}

/**
 * WebRTC Transport
 * 
 * Manages WebRTC peer connections with comprehensive
 * state management and error handling.
 */
export class WebRTCTransport extends EventEmitter<WebRTCEvents> {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private state: WebRTCState = 'new';
  private logger: Logger;
  private config: Required<WebRTCTransportConfig>;
  private candidateCount = 0;
  private prevCandidateCount = -1;
  private gatheringTimeout: TimeoutController | null = null;
  private localDescription: RTCSessionDescriptionInit | null = null;
  private remoteDescription: RTCSessionDescriptionInit | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(config: WebRTCTransportConfig = {}) {
    super();

    this.config = {
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
      enableDataChannel: true,
      dataChannelConfig: { ordered: true },
      gatheringTimeout: 10000,
      connectionTimeout: 15000,
      enableLogging: false,
      ...config,
    };

    this.logger = new Logger(
      'WebRTCTransport',
      this.config.enableLogging ? LogLevel.DEBUG : LogLevel.NONE,
    );
  }

  /**
   * Get current WebRTC state
   */
  public getState(): WebRTCState {
    return this.state;
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Get native RTCPeerConnection instance
   */
  public getPeerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  /**
   * Get data channel
   */
  public getDataChannel(): RTCDataChannel | null {
    return this.dc;
  }

  /**
   * Create and initialize peer connection
   */
  public async createPeerConnection(): Promise<void> {
    if (this.pc) {
      this.logger.warn('Peer connection already exists, closing...');
      await this.close();
    }

    this.logger.info('Creating peer connection', {
      iceServers: this.config.iceServers,
    });

    const config: RTCConfiguration = {
      iceServers: this.config.iceServers,
      iceCandidatePoolSize: 10,
    };

    this.pc = new RTCPeerConnection(config);
    this.setState('new');

    this.setupPeerConnectionListeners();

    if (this.config.enableDataChannel) {
      this.createDataChannel();
    }
  }

  /**
   * Setup peer connection event listeners
   */
  private setupPeerConnectionListeners(): void {
    if (!this.pc) return;

    // ICE candidate event
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.candidateCount++;
        this.logger.debug('ICE candidate', {
          candidate: event.candidate.candidate,
        });
        this.emit('iceCandidate', { candidate: event.candidate });
      } else {
        this.logger.info('ICE gathering complete');
        this.emit('iceGatheringComplete', undefined);
      }
    };

    // ICE gathering state change
    this.pc.onicegatheringstatechange = () => {
      this.logger.info('ICE gathering state changed', {
        state: this.pc?.iceGatheringState,
      });

      if (this.pc?.iceGatheringState === 'complete') {
        this.gatheringTimeout?.clear();
      }
    };

    // ICE connection state change
    this.pc.oniceconnectionstatechange = () => {
      this.logger.info('ICE connection state changed', {
        state: this.pc?.iceConnectionState,
      });

      if (this.pc?.iceConnectionState === 'failed') {
        this.handleConnectionFailure('ICE connection failed');
      } else if (this.pc?.iceConnectionState === 'disconnected') {
        this.setState('disconnected');
        this.emit('disconnected', undefined);
      } else if (this.pc?.iceConnectionState === 'connected') {
        this.setState('connected');
        this.emit('connected', undefined);
      }
    };

    // Connection state change
    this.pc.onconnectionstatechange = () => {
      this.logger.info('Connection state changed', {
        state: this.pc?.connectionState,
      });

      switch (this.pc?.connectionState) {
        case 'connecting':
          this.setState('connecting');
          break;
        case 'connected':
          this.setState('connected');
          this.emit('connected', undefined);
          break;
        case 'disconnected':
          this.setState('disconnected');
          this.emit('disconnected', undefined);
          break;
        case 'failed':
          this.setState('failed');
          this.handleConnectionFailure('Peer connection failed');
          break;
        case 'closed':
          this.setState('closed');
          break;
      }
    };

    // Signaling state change
    this.pc.onsignalingstatechange = () => {
      this.logger.debug('Signaling state changed', {
        state: this.pc?.signalingState,
      });
    };

    // Track event (incoming media)
    this.pc.ontrack = (event) => {
      this.logger.info('Track received', {
        kind: event.track.kind,
        id: event.track.id,
      });
      this.emit('track', {
        track: event.track,
        streams: Array.from(event.streams),
      });
    };

    // Negotiation needed
    this.pc.onnegotiationneeded = () => {
      this.logger.debug('Negotiation needed');
    };
  }

  /**
   * Create data channel
   */
  private createDataChannel(): void {
    if (!this.pc) {
      throw new Error('Peer connection not initialized');
    }

    this.logger.info('Creating data channel');
    this.dc = this.pc.createDataChannel('simli', this.config.dataChannelConfig);
    this.setupDataChannelListeners();
  }

  /**
   * Setup data channel event listeners
   */
  private setupDataChannelListeners(): void {
    if (!this.dc) return;

    this.dc.onopen = () => {
      this.logger.info('Data channel opened');
      this.emit('dataChannelOpen', undefined);
    };

    this.dc.onclose = () => {
      this.logger.info('Data channel closed');
      this.emit('dataChannelClose', undefined);
    };

    this.dc.onerror = (error) => {
      this.logger.error('Data channel error', { error });
      this.emit('error', { error: new Error('Data channel error') });
    };

    this.dc.onmessage = (event) => {
      this.logger.debug('Data channel message', {
        type: typeof event.data,
      });
      this.emit('dataChannelMessage', { data: event.data });
    };
  }

  /**
   * Add transceiver for receiving media
   */
  public addTransceiver(
    kind: 'audio' | 'video',
    init?: RTCRtpTransceiverInit,
  ): RTCRtpTransceiver | null {
    if (!this.pc) {
      this.logger.error('Cannot add transceiver: peer connection not initialized');
      return null;
    }

    this.logger.info('Adding transceiver', { kind });
    return this.pc.addTransceiver(kind, init);
  }

  /**
   * Create SDP offer
   */
  public async createOffer(
    options?: RTCOfferOptions,
  ): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) {
      throw new Error('Peer connection not initialized');
    }

    this.logger.info('Creating offer');
    const offer = await this.pc.createOffer(options);
    await this.pc.setLocalDescription(offer);
    this.localDescription = offer;

    // Wait for ICE gathering
    await this.waitForIceGathering();

    // Return the complete local description with ICE candidates
    return this.pc.localDescription!;
  }

  /**
   * Create SDP answer
   */
  public async createAnswer(
    options?: RTCAnswerOptions,
  ): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) {
      throw new Error('Peer connection not initialized');
    }

    this.logger.info('Creating answer');
    const answer = await this.pc.createAnswer(options);
    await this.pc.setLocalDescription(answer);
    this.localDescription = answer;

    // Wait for ICE gathering
    await this.waitForIceGathering();

    // Return the complete local description with ICE candidates
    return this.pc.localDescription!;
  }

  /**
   * Set remote description
   */
  public async setRemoteDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    if (!this.pc) {
      throw new Error('Peer connection not initialized');
    }

    this.logger.info('Setting remote description', { type: description.type });
    await this.pc.setRemoteDescription(new RTCSessionDescription(description));
    this.remoteDescription = description;

    // Add any pending ICE candidates
    if (this.pendingCandidates.length > 0) {
      this.logger.info('Adding pending ICE candidates', {
        count: this.pendingCandidates.length,
      });

      for (const candidate of this.pendingCandidates) {
        await this.addIceCandidate(candidate);
      }

      this.pendingCandidates = [];
    }
  }

  /**
   * Add ICE candidate
   */
  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) {
      throw new Error('Peer connection not initialized');
    }

    // If remote description is not set, queue the candidate
    if (!this.pc.remoteDescription) {
      this.logger.debug('Queueing ICE candidate (remote description not set)');
      this.pendingCandidates.push(candidate);
      return;
    }

    this.logger.debug('Adding ICE candidate');
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /**
   * Wait for ICE gathering to complete
   */
  private async waitForIceGathering(): Promise<void> {
    if (!this.pc) return;

    if (this.pc.iceGatheringState === 'complete') {
      this.logger.debug('ICE gathering already complete');
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.candidateCount = 0;
      this.prevCandidateCount = 0;

      // Setup timeout
      this.gatheringTimeout = new TimeoutController({
        timeout: this.config.gatheringTimeout,
      });

      if (this.gatheringTimeout.signal.addEventListener) {
        this.gatheringTimeout.signal.addEventListener('abort', () => {
          this.logger.warn('ICE gathering timeout, proceeding anyway');
          resolve();
        });
      }

      // Check periodically if gathering is complete
      const checkInterval = setInterval(() => {
        if (
          this.pc?.iceGatheringState === 'complete' ||
          this.candidateCount === this.prevCandidateCount
        ) {
          clearInterval(checkInterval);
          this.gatheringTimeout?.clear();
          this.logger.info('ICE gathering completed', {
            candidateCount: this.candidateCount,
          });
          resolve();
        } else {
          this.prevCandidateCount = this.candidateCount;
        }
      }, 150);
    });
  }

  /**
   * Get local description
   */
  public getLocalDescription(): RTCSessionDescriptionInit | null {
    return this.pc?.localDescription || this.localDescription;
  }

  /**
   * Get remote description
   */
  public getRemoteDescription(): RTCSessionDescriptionInit | null {
    return this.pc?.remoteDescription || this.remoteDescription;
  }

  /**
   * Send data via data channel
   */
  public send(data: string | ArrayBuffer | Uint8Array): void {
    if (!this.dc) {
      throw new Error('Data channel not initialized');
    }

    if (this.dc.readyState !== 'open') {
      throw new Error(`Data channel not open (state: ${this.dc.readyState})`);
    }

    // RTCDataChannel.send() accepts string, Blob, ArrayBuffer, or ArrayBufferView
    this.dc.send(data as any);

    this.logger.debug('Data sent', {
      type: typeof data,
      size: data instanceof Uint8Array ? data.length : undefined,
    });
  }

  /**
   * Close peer connection
   */
  public async close(): Promise<void> {
    this.logger.info('Closing peer connection');

    this.gatheringTimeout?.clear();

    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.setState('closed');
    this.localDescription = null;
    this.remoteDescription = null;
    this.pendingCandidates = [];
    this.candidateCount = 0;
    this.prevCandidateCount = -1;
  }

  /**
   * Destroy transport and cleanup
   */
  public destroy(): void {
    this.close();
    this.removeAllListeners();
    this.logger.info('WebRTC transport destroyed');
  }

  /**
   * Handle connection failure
   */
  private handleConnectionFailure(reason: string): void {
    this.logger.error('Connection failure', { reason });
    this.setState('failed');
    this.emit('error', { error: new Error(reason) });
  }

  /**
   * Set WebRTC state and emit event
   */
  private setState(state: WebRTCState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', { state });
      this.logger.debug('State changed', { state });
    }
  }

  /**
   * Get connection statistics
   */
  public async getStats(): Promise<RTCStatsReport | null> {
    if (!this.pc) {
      return null;
    }

    return await this.pc.getStats();
  }

  /**
   * Get detailed connection info
   */
  public getConnectionInfo(): {
    state: WebRTCState;
    connectionState: RTCPeerConnectionState | null;
    iceConnectionState: RTCIceConnectionState | null;
    iceGatheringState: RTCIceGatheringState | null;
    signalingState: RTCSignalingState | null;
    dataChannelState: RTCDataChannelState | null;
    hasLocalDescription: boolean;
    hasRemoteDescription: boolean;
  } {
    return {
      state: this.state,
      connectionState: this.pc?.connectionState || null,
      iceConnectionState: this.pc?.iceConnectionState || null,
      iceGatheringState: this.pc?.iceGatheringState || null,
      signalingState: this.pc?.signalingState || null,
      dataChannelState: this.dc?.readyState || null,
      hasLocalDescription: !!this.localDescription,
      hasRemoteDescription: !!this.remoteDescription,
    };
  }
}
