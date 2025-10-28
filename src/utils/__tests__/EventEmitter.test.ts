import { EventEmitter } from '../EventEmitter';

// Define test event types
interface TestEvents {
  connected: { timestamp: number };
  disconnected: { reason: string };
  error: { message: string; code: number };
  dataReceived: { bytes: number; data: Uint8Array };
  noData: void;
}

describe('EventEmitter', () => {
  let emitter: EventEmitter<TestEvents>;

  beforeEach(() => {
    emitter = new EventEmitter<TestEvents>();
  });

  describe('on() and emit()', () => {
    it('should register and call event listeners', () => {
      const listener = jest.fn();
      emitter.on('connected', listener);
      
      const eventData = { timestamp: 12345 };
      emitter.emit('connected', eventData);
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(eventData);
    });

    it('should call multiple listeners for the same event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      
      emitter.on('error', listener1);
      emitter.on('error', listener2);
      emitter.on('error', listener3);
      
      const eventData = { message: 'Test error', code: 500 };
      emitter.emit('error', eventData);
      
      expect(listener1).toHaveBeenCalledWith(eventData);
      expect(listener2).toHaveBeenCalledWith(eventData);
      expect(listener3).toHaveBeenCalledWith(eventData);
    });

    it('should handle multiple different events independently', () => {
      const connectedListener = jest.fn();
      const errorListener = jest.fn();
      
      emitter.on('connected', connectedListener);
      emitter.on('error', errorListener);
      
      emitter.emit('connected', { timestamp: 1000 });
      emitter.emit('error', { message: 'Error', code: 404 });
      
      expect(connectedListener).toHaveBeenCalledTimes(1);
      expect(errorListener).toHaveBeenCalledTimes(1);
    });

    it('should handle events with void data type', () => {
      const listener = jest.fn();
      emitter.on('noData', listener);
      
      emitter.emit('noData', undefined);
      
      expect(listener).toHaveBeenCalledWith(undefined);
    });

    it('should not throw if emitting event with no listeners', () => {
      expect(() => {
        emitter.emit('connected', { timestamp: 1000 });
      }).not.toThrow();
    });
  });

  describe('off()', () => {
    it('should remove a specific listener', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      emitter.on('connected', listener1);
      emitter.on('connected', listener2);
      emitter.off('connected', listener1);
      
      emitter.emit('connected', { timestamp: 1000 });
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should do nothing if removing non-existent listener', () => {
      const listener = jest.fn();
      
      expect(() => {
        emitter.off('connected', listener);
      }).not.toThrow();
    });

    it('should clean up event entry when all listeners removed', () => {
      const listener = jest.fn();
      
      emitter.on('connected', listener);
      expect(emitter.listenerCount('connected')).toBe(1);
      
      emitter.off('connected', listener);
      expect(emitter.listenerCount('connected')).toBe(0);
      expect(emitter.eventNames()).toHaveLength(0);
    });
  });

  describe('once()', () => {
    it('should call listener only once then auto-remove', () => {
      const listener = jest.fn();
      
      emitter.once('connected', listener);
      
      emitter.emit('connected', { timestamp: 1000 });
      emitter.emit('connected', { timestamp: 2000 });
      emitter.emit('connected', { timestamp: 3000 });
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ timestamp: 1000 });
    });

    it('should work alongside regular listeners', () => {
      const regularListener = jest.fn();
      const onceListener = jest.fn();
      
      emitter.on('error', regularListener);
      emitter.once('error', onceListener);
      
      emitter.emit('error', { message: 'Error 1', code: 1 });
      emitter.emit('error', { message: 'Error 2', code: 2 });
      
      expect(regularListener).toHaveBeenCalledTimes(2);
      expect(onceListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeAllListeners()', () => {
    it('should remove all listeners for a specific event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const otherListener = jest.fn();
      
      emitter.on('connected', listener1);
      emitter.on('connected', listener2);
      emitter.on('error', otherListener);
      
      emitter.removeAllListeners('connected');
      
      emitter.emit('connected', { timestamp: 1000 });
      emitter.emit('error', { message: 'Error', code: 500 });
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
      expect(otherListener).toHaveBeenCalledTimes(1);
    });

    it('should remove all listeners for all events when no event specified', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      
      emitter.on('connected', listener1);
      emitter.on('error', listener2);
      emitter.on('disconnected', listener3);
      
      emitter.removeAllListeners();
      
      emitter.emit('connected', { timestamp: 1000 });
      emitter.emit('error', { message: 'Error', code: 500 });
      emitter.emit('disconnected', { reason: 'test' });
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
      expect(listener3).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount()', () => {
    it('should return correct count of listeners', () => {
      expect(emitter.listenerCount('connected')).toBe(0);
      
      emitter.on('connected', jest.fn());
      expect(emitter.listenerCount('connected')).toBe(1);
      
      emitter.on('connected', jest.fn());
      expect(emitter.listenerCount('connected')).toBe(2);
      
      emitter.on('connected', jest.fn());
      expect(emitter.listenerCount('connected')).toBe(3);
    });

    it('should return 0 for events with no listeners', () => {
      expect(emitter.listenerCount('error')).toBe(0);
    });
  });

  describe('eventNames()', () => {
    it('should return array of event names with listeners', () => {
      expect(emitter.eventNames()).toEqual([]);
      
      emitter.on('connected', jest.fn());
      emitter.on('error', jest.fn());
      emitter.on('disconnected', jest.fn());
      
      const names = emitter.eventNames();
      expect(names).toHaveLength(3);
      expect(names).toContain('connected');
      expect(names).toContain('error');
      expect(names).toContain('disconnected');
    });
  });

  describe('Error handling', () => {
    it('should catch errors in listeners and continue calling other listeners', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();
      
      emitter.on('connected', errorListener);
      emitter.on('connected', goodListener);
      
      emitter.emit('connected', { timestamp: 1000 });
      
      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Type safety', () => {
    it('should enforce correct event data types at compile time', () => {
      // This test primarily validates TypeScript compilation
      // If it compiles, the types are working correctly
      
      emitter.on('connected', (data) => {
        // TypeScript should infer data as { timestamp: number }
        expect(typeof data.timestamp).toBe('number');
      });
      
      emitter.on('error', (data) => {
        // TypeScript should infer data as { message: string; code: number }
        expect(typeof data.message).toBe('string');
        expect(typeof data.code).toBe('number');
      });
      
      emitter.emit('connected', { timestamp: 123 });
      emitter.emit('error', { message: 'Test', code: 404 });
    });
  });

  describe('Listener modification during emit', () => {
    it('should handle listeners being removed during emit', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn(() => {
        emitter.off('connected', listener3);
      });
      const listener3 = jest.fn();
      
      emitter.on('connected', listener1);
      emitter.on('connected', listener2);
      emitter.on('connected', listener3);
      
      emitter.emit('connected', { timestamp: 1000 });
      
      // All three should be called since we iterate over a copy
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
      
      // But listener3 should be removed for next emit
      emitter.emit('connected', { timestamp: 2000 });
      expect(listener3).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should handle listeners being added during emit', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      let dynamicListenerAdded = false;
      
      const listener = jest.fn(() => {
        if (!dynamicListenerAdded) {
          emitter.on('connected', listener2);
          dynamicListenerAdded = true;
        }
      });
      
      emitter.on('connected', listener1);
      emitter.on('connected', listener);
      
      emitter.emit('connected', { timestamp: 1000 });
      
      // listener2 was added during emit, so it shouldn't be called in the first emit
      expect(listener2).not.toHaveBeenCalled();
      
      // But should be called in the second emit
      emitter.emit('connected', { timestamp: 2000 });
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });
});
