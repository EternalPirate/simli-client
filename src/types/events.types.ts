/**
 * Event types for SimliClient
 */

/**
 * Connection state change event data
 */
export interface ConnectionStateEvent {
  /** Current connection state */
  state: 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
  
  /** Timestamp of the state change */
  timestamp: number;
  
  /** Optional reason for state change */
  reason?: string;
}

/**
 * Error event data
 */
export interface ErrorEvent {
  /** Error message */
  message: string;
  
  /** Error code or type */
  code?: string | number;
  
  /** Original error object */
  error?: Error;
  
  /** Timestamp of the error */
  timestamp: number;
  
  /** Whether the error is recoverable */
  recoverable?: boolean;
}

/**
 * Audio data received event
 */
export interface AudioDataEvent {
  /** Audio data as Uint8Array */
  data: Uint8Array;
  
  /** Timestamp when data was received */
  timestamp: number;
  
  /** Size of the audio data in bytes */
  size: number;
}

/**
 * Video frame received event
 */
export interface VideoFrameEvent {
  /** Video frame as ImageData or VideoFrame */
  frame: ImageData | VideoFrame;
  
  /** Timestamp when frame was received */
  timestamp: number;
  
  /** Frame width */
  width: number;
  
  /** Frame height */
  height: number;
}

/**
 * Metadata received event
 */
export interface MetadataEvent {
  /** Metadata payload */
  data: any;
  
  /** Metadata type */
  type: string;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Connection quality metrics
 */
export interface QualityMetricsEvent {
  /** Packet loss percentage (0-100) */
  packetLoss: number;
  
  /** Round-trip time in milliseconds */
  rtt: number;
  
  /** Current bitrate in kbps */
  bitrate: number;
  
  /** Frame rate */
  frameRate: number;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Map of all event types to their data
 */
export interface SimliClientEvents {
  /** Connection state changed */
  'connection:state': ConnectionStateEvent;
  
  /** Connection established */
  'connection:connected': { timestamp: number };
  
  /** Connection closed */
  'connection:disconnected': { reason?: string; timestamp: number };
  
  /** Connection failed */
  'connection:failed': ErrorEvent;
  
  /** Error occurred */
  error: ErrorEvent;
  
  /** Audio data received */
  'audio:data': AudioDataEvent;
  
  /** Video frame received */
  'video:frame': VideoFrameEvent;
  
  /** Metadata received */
  metadata: MetadataEvent;
  
  /** Quality metrics updated */
  'metrics:quality': QualityMetricsEvent;
  
  /** Audio input started */
  'audio:start': { timestamp: number };
  
  /** Audio input stopped */
  'audio:stop': { timestamp: number };
  
  /** Ready to send audio */
  'ready': { timestamp: number };
}

/**
 * Event names
 */
export type SimliEventName = keyof SimliClientEvents;

/**
 * Event data for a specific event
 */
export type SimliEventData<T extends SimliEventName> = SimliClientEvents[T];
