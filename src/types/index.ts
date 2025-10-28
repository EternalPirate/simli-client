/**
 * Type definitions for SimliClient
 */

// Configuration types
export type {
  SimliClientConfig,
  PartialSimliClientConfig,
  RequiredConfig,
  OptionalConfig,
} from './config.types';

// Event types
export type {
  ConnectionStateEvent,
  ErrorEvent,
  AudioDataEvent,
  VideoFrameEvent,
  MetadataEvent,
  QualityMetricsEvent,
  SimliClientEvents,
  SimliEventName,
  SimliEventData,
} from './events.types';

// State types
export {
  ConnectionState,
  AudioState,
  VideoState,
} from './state.types';

export type {
  ClientState,
  SessionInfo,
  StateTransition,
  ConnectionStats,
} from './state.types';

// Protocol types
export {
  MessageType,
  ProtocolErrorCode,
} from './protocol.types';

export type {
  BaseMessage,
  HandshakeMessage,
  AudioDataMessage,
  VideoDataMessage,
  MetadataMessage,
  ControlMessage,
  PingMessage,
  PongMessage,
  ErrorMessage,
  CloseMessage,
  ProtocolMessage,
  SDPMessage,
  ICECandidateMessage,
} from './protocol.types';
