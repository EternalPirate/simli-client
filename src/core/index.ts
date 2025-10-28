/**
 * Core module exports
 */

export { ConnectionManager } from './ConnectionManager';
export type { ConnectionManagerEvents, ConnectionState } from './ConnectionManager';

export { StateManager } from './StateManager';
export type {
  StateManagerEvents,
  ApplicationState,
  StateManagerConfig,
} from './StateManager';

export { ConfigValidator, ConfigValidationError } from './ConfigValidator';
export type { ValidationResult } from './ConfigValidator';
