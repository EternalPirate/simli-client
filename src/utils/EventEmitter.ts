/**
 * Type-safe event emitter for SimliClient
 * Provides strongly-typed event handling with listener management
 */

export type EventListener<T = any> = (data: T) => void;

export interface IEventEmitter<TEventMap extends Record<string, any>> {
  on<K extends keyof TEventMap>(event: K, listener: EventListener<TEventMap[K]>): void;
  off<K extends keyof TEventMap>(event: K, listener: EventListener<TEventMap[K]>): void;
  once<K extends keyof TEventMap>(event: K, listener: EventListener<TEventMap[K]>): void;
  emit<K extends keyof TEventMap>(event: K, data: TEventMap[K]): void;
  removeAllListeners(event?: keyof TEventMap): void;
  listenerCount(event: keyof TEventMap): number;
}

/**
 * Generic type-safe event emitter
 * 
 * @example
 * ```typescript
 * interface MyEvents {
 *   connected: { timestamp: number };
 *   error: { message: string; code: number };
 * }
 * 
 * const emitter = new EventEmitter<MyEvents>();
 * emitter.on('connected', (data) => {
 *   console.log('Connected at', data.timestamp);
 * });
 * emitter.emit('connected', { timestamp: Date.now() });
 * ```
 */
export class EventEmitter<TEventMap extends Record<string, any>> implements IEventEmitter<TEventMap> {
  private listeners: Map<keyof TEventMap, Set<EventListener<any>>> = new Map();

  /**
   * Register an event listener
   * @param event - The event name
   * @param listener - The callback function
   */
  on<K extends keyof TEventMap>(event: K, listener: EventListener<TEventMap[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Remove an event listener
   * @param event - The event name
   * @param listener - The callback function to remove
   */
  off<K extends keyof TEventMap>(event: K, listener: EventListener<TEventMap[K]>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Register a one-time event listener
   * @param event - The event name
   * @param listener - The callback function (will be called once then removed)
   */
  once<K extends keyof TEventMap>(event: K, listener: EventListener<TEventMap[K]>): void {
    const onceWrapper: EventListener<TEventMap[K]> = (data) => {
      this.off(event, onceWrapper);
      listener(data);
    };
    this.on(event, onceWrapper);
  }

  /**
   * Emit an event to all registered listeners
   * @param event - The event name
   * @param data - The event data
   */
  emit<K extends keyof TEventMap>(event: K, data: TEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      // Create a copy to avoid issues if listeners modify the set during iteration
      const listenersCopy = Array.from(eventListeners);
      for (const listener of listenersCopy) {
        try {
          listener(data);
        } catch (error) {
          // Log errors but don't stop other listeners
          console.error(`Error in event listener for "${String(event)}":`, error);
        }
      }
    }
  }

  /**
   * Remove all listeners for a specific event, or all listeners if no event specified
   * @param event - Optional event name. If omitted, removes all listeners for all events
   */
  removeAllListeners(event?: keyof TEventMap): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the count of listeners for a specific event
   * @param event - The event name
   * @returns The number of listeners registered for this event
   */
  listenerCount(event: keyof TEventMap): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Get all event names that have listeners
   * @returns Array of event names
   */
  eventNames(): Array<keyof TEventMap> {
    return Array.from(this.listeners.keys());
  }
}
