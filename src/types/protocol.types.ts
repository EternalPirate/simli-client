/**
 * Protocol and message types for SimliClient communication
 */

/**
 * WebSocket message types
 */
export enum MessageType {
  /** Initial handshake */
  HANDSHAKE = 'handshake',
  
  /** Audio data */
  AUDIO_DATA = 'audio_data',
  
  /** Video data */
  VIDEO_DATA = 'video_data',
  
  /** Metadata */
  METADATA = 'metadata',
  
  /** Control message */
  CONTROL = 'control',
  
  /** Ping/keepalive */
  PING = 'ping',
  
  /** Pong response */
  PONG = 'pong',
  
  /** Error message */
  ERROR = 'error',
  
  /** Close connection */
  CLOSE = 'close',
}

/**
 * Base message structure
 */
export interface BaseMessage {
  /** Message type */
  type: MessageType;
  
  /** Message timestamp */
  timestamp: number;
  
  /** Optional message ID for tracking */
  id?: string;
}

/**
 * Handshake request message
 */
export interface HandshakeMessage extends BaseMessage {
  type: MessageType.HANDSHAKE;
  
  /** API key */
  apiKey: string;
  
  /** Face ID */
  faceId: string;
  
  /** Client version */
  version?: string;
  
  /** Client capabilities */
  capabilities?: string[];
}

/**
 * Audio data message
 */
export interface AudioDataMessage extends BaseMessage {
  type: MessageType.AUDIO_DATA;
  
  /** Audio data payload */
  data: Uint8Array | ArrayBuffer;
  
  /** Audio format metadata */
  format?: {
    sampleRate?: number;
    channels?: number;
    bitDepth?: number;
  };
}

/**
 * Video data message
 */
export interface VideoDataMessage extends BaseMessage {
  type: MessageType.VIDEO_DATA;
  
  /** Video frame data */
  data: Uint8Array | ArrayBuffer;
  
  /** Frame metadata */
  metadata?: {
    width?: number;
    height?: number;
    format?: string;
  };
}

/**
 * Metadata message
 */
export interface MetadataMessage extends BaseMessage {
  type: MessageType.METADATA;
  
  /** Metadata payload */
  data: any;
  
  /** Metadata category */
  category?: string;
}

/**
 * Control message
 */
export interface ControlMessage extends BaseMessage {
  type: MessageType.CONTROL;
  
  /** Control action */
  action: 'start' | 'stop' | 'pause' | 'resume' | 'configure';
  
  /** Optional parameters */
  params?: Record<string, any>;
}

/**
 * Ping message
 */
export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

/**
 * Pong message
 */
export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
  
  /** Echo of ping timestamp for RTT calculation */
  pingTimestamp?: number;
}

/**
 * Error message
 */
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  
  /** Error code */
  code: string | number;
  
  /** Error message */
  message: string;
  
  /** Additional error details */
  details?: any;
  
  /** Whether error is recoverable */
  recoverable?: boolean;
}

/**
 * Close message
 */
export interface CloseMessage extends BaseMessage {
  type: MessageType.CLOSE;
  
  /** Close reason */
  reason?: string;
  
  /** Close code */
  code?: number;
}

/**
 * Union of all message types
 */
export type ProtocolMessage =
  | HandshakeMessage
  | AudioDataMessage
  | VideoDataMessage
  | MetadataMessage
  | ControlMessage
  | PingMessage
  | PongMessage
  | ErrorMessage
  | CloseMessage;

/**
 * WebRTC SDP offer/answer
 */
export interface SDPMessage {
  /** SDP type */
  type: 'offer' | 'answer';
  
  /** SDP content */
  sdp: string;
}

/**
 * WebRTC ICE candidate
 */
export interface ICECandidateMessage {
  /** Candidate string */
  candidate: string;
  
  /** SDP M-line index */
  sdpMLineIndex: number;
  
  /** SDP Media ID */
  sdpMid: string;
}

/**
 * Protocol error codes
 */
export enum ProtocolErrorCode {
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR',
  UNSUPPORTED = 'UNSUPPORTED',
  TIMEOUT = 'TIMEOUT',
  CONNECTION_LOST = 'CONNECTION_LOST',
}

/**
 * WebSocket connection states
 */
export type WebSocketState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * WebSocket message (for transport layer)
 */
export type WebSocketMessage =
  | { type: 'speak' }
  | { type: 'silent' }
  | { type: 'missing_session_token' }
  | { type: 'answer'; sdp: string }
  | { type: 'binary'; data: ArrayBuffer | Blob }
  | ProtocolMessage;

/**
 * Session token request
 */
export interface SessionTokenRequest {
  faceId: string;
  isJPG: boolean;
  apiKey: string;
  syncAudio: boolean;
  handleSilence: boolean;
  maxSessionLength: number;
  maxIdleTime: number;
  model: 'fasttalk' | 'artalk';
}

/**
 * Session token response
 */
export interface SessionTokenResponse {
  session_token: string;
}
