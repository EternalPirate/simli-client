# Simli SDK Refactoring Proposal

## Executive Summary

The current Simli SDK implementation suffers from several architectural issues that impact maintainability, testability, and reliability. This proposal outlines a comprehensive refactoring strategy to address these concerns while following WebRTC and modern JavaScript best practices.

**Key Issues:**
- Monolithic God Object pattern (1000+ lines in single class)
- Tight coupling between concerns (WebRTC, WebSocket, Audio, State)
- Poor error handling and race conditions
- Unclear state management and lifecycle
- Missing dependency injection and difficult to test
- Memory leaks and resource management issues

**Proposed Solution:**
- Modular architecture with clear separation of concerns
- State machine for connection lifecycle
- Proper error boundaries and retry strategies
- Dependency injection for testing
- Reactive state management
- Comprehensive resource cleanup

---

## Detailed Problem Analysis

### 1. **Architectural Problems**

#### God Object Anti-pattern
The `SimliClient` class handles everything: WebRTC peer connections, WebSocket communication, audio processing, state management, event handling, error recovery, and resource cleanup. This violates the Single Responsibility Principle and makes the code difficult to understand, test, and maintain.

**Impact:**
- Difficult to reason about which method affects what state
- Hard to test individual components in isolation
- Changes in one area risk breaking unrelated functionality
- New developers face steep learning curve

#### Tight Coupling
All concerns are intertwined within a single class. The WebSocket logic knows about RTCPeerConnection, the audio processor accesses WebSocket state, and cleanup methods must understand all subsystems.

**Impact:**
- Cannot swap implementations (e.g., different signaling protocols)
- Testing requires mocking the entire world
- Parallel development is difficult
- Reusability is zero

### 2. **State Management Issues**

#### Scattered State
State is spread across 40+ private properties with no clear state machine. Properties like `sessionInitialized`, `videoReceived`, `retryAttempt`, `candidateCount` exist without a cohesive model.

**Problems:**
- No single source of truth for connection state
- Race conditions between state transitions
- Impossible to know valid state combinations
- Debug nightmare: "Why is videoReceived true but pc is null?"

#### Implicit State Transitions
State changes happen implicitly through property assignments scattered throughout the code. There's no validation that transitions are valid or that all necessary cleanup happens.

**Example Issue:**
```typescript
// In one place:
this.sessionInitialized = true;

// In another place:
if (this.sessionInitialized) { /* ... */ }

// But what if sessionInitialized is true and webSocket is null?
// The code doesn't prevent this invalid state.
```

### 3. **Concurrency & Race Conditions**

#### Promise.race() Misuse
The SDK uses `Promise.race()` for timeouts but doesn't properly cancel the losing operation. This leaves WebSocket connections, fetch requests, and timers running in the background.

**Example:**
```typescript
await Promise.race([
    wsConnectPromise,
    new Promise((_, reject) => 
        setTimeout(() => reject(new Error("timeout")), 5000)
    )
]);
// If timeout wins, wsConnectPromise continues running!
// WebSocket will open later and cause unexpected behavior
```

#### Polling Patterns
The code polls for state changes (like waiting for `this.answer`) using `setTimeout` recursion instead of proper async coordination:

```typescript
const checkAnswer = async () => {
    if (this.answer) {
        resolve();
    } else {
        setTimeout(checkAnswer, 100); // Polling!
    }
};
```

**Better approach:** Use Promises that resolve when the answer arrives.

### 4. **Error Handling Problems**

#### Silent Failures
Many error paths log to console but don't propagate errors or update state appropriately. The application may continue in an invalid state.

**Examples:**
- `createSessionToken` throws but caller may not handle it
- `sendAudioData` silently returns if session not initialized
- ICE gathering timeout rejects but connection may continue

#### Retry Logic Issues
Retry logic is implemented in multiple places (ICE servers, connection attempts) with inconsistent strategies. The retry counter is shared across different failure types.

**Problems:**
- Retry attempts don't distinguish between transient and permanent failures
- No exponential backoff
- No jitter to prevent thundering herd
- Retry state persists across cleanup/restart cycles

#### Error Recovery Gaps
When errors occur, the SDK attempts automatic recovery but has gaps:
- WebSocket errors trigger reconnection, but what if the session token expired?
- ICE connection failures retry, but candidate gathering may have already timed out
- Cleanup in error handlers might fail silently

### 5. **Resource Management**

#### Memory Leaks
The event emitter stores callbacks but there's no automatic cleanup. Event listeners on `pc`, `dc`, `ws` accumulate on reconnection attempts.

**Leak Sources:**
- Event listeners not removed before object disposal
- Timers not cleared (connectionTimeout, dcInterval)
- Audio context never closed
- Media streams not stopped
- Promises awaiting never-resolved values

#### Cleanup Order
The `cleanup()` method closes resources in a specific order but doesn't wait for operations to complete. WebSocket may still be sending data when closed.

**Better approach:** 
- Graceful shutdown with wait periods
- Resource disposal in reverse initialization order
- Proper async cleanup with error handling

### 6. **WebRTC-Specific Issues**

#### ICE Candidate Gathering
The code polls `candidateCount` to detect ICE gathering completion instead of listening to the proper events. This is fragile and race-prone.

**Standard approach:**
```typescript
// Listen for 'icegatheringstatechange' event
pc.addEventListener('icegatheringstatechange', () => {
    if (pc.iceGatheringState === 'complete') {
        resolve();
    }
});
```

#### SDP Manipulation
The code serializes and deserializes SDP multiple times without clear benefit. The `localDescription` is converted to JSON, sent over WebSocket, and parsed on the server.

**Concerns:**
- Unnecessary overhead
- Potential for corruption
- Debugging difficulties

#### Connection State Confusion
RTCPeerConnection has multiple state properties: `connectionState`, `iceConnectionState`, `iceGatheringState`, `signalingState`. The code monitors all of them but doesn't have a clear model of how they relate.

**Result:** Redundant event handlers that may conflict or trigger unexpected behavior.

### 7. **Audio Processing Issues**

#### Inline AudioWorklet Code
The AudioWorklet processor is defined as a string template literal and injected via blob URL. This makes it difficult to:
- Debug (no source maps, can't set breakpoints)
- Test (requires full browser environment)
- Modify (must restart entire SDK)
- Optimize (no dead code elimination)

#### Hardcoded Buffer Size
Buffer size is hardcoded to 3000 samples. This doesn't adapt to:
- Different sample rates
- Network conditions
- Latency requirements

#### No Backpressure Handling
If WebSocket cannot keep up with audio data rate, there's no backpressure mechanism. Audio chunks are sent as fast as they arrive, potentially overwhelming the connection.

### 8. **Configuration & Initialization**

#### Mutable Configuration
The `Initialize()` method can be called multiple times (it's called from cleanup!), allowing configuration to change during runtime. This is dangerous.

**Issue:**
```typescript
cleanup() {
    // ... cleanup code ...
    if (this.config) {
        this.Initialize(this.config); // Re-initialize!
    }
}
```

#### Validation Gaps
Configuration validation is minimal. Many properties are optional but required for certain features:
- `videoRef` and `audioRef` are only checked with console.error
- Invalid `SimliURL` format isn't caught
- Conflicting options aren't validated (e.g., session_token + apiKey)

#### Side Effects in Initialize
The `Initialize()` method has side effects: logs to console, checks browser environment, modifies DOM references. This makes testing difficult and violates command-query separation.

### 9. **Testing & Maintainability**

#### Untestable Design
The current design makes unit testing nearly impossible:
- Constructor creates no dependencies (all created internally)
- Methods directly access browser APIs (WebSocket, RTCPeerConnection, AudioContext)
- No interfaces or protocols for mocking
- Global state and side effects everywhere

#### No Type Safety for Events
While TypeScript interfaces exist for events, the implementation uses a generic Map that bypasses type checking for event emission.

#### Magic Strings & Numbers
The code is full of magic values:
- "SKIP", "DONE", "START", "STOP", "ACK", "SPEAK", "SILENT", "PLAY_IMMEDIATE", "ping ", "pong"
- 3000, 6000, 100, 150, 5000, 10000, 15000
- "unified-plan", "recvonly", "chat", "audio-processor"

**Impact:** Difficult to understand intent, easy to introduce typos, hard to refactor.

### 10. **WebSocket Protocol Issues**

#### Mixed Message Types
WebSocket sends and receives multiple message types without a formal protocol:
- Text strings: "SKIP", "DONE", "ping timestamp"
- JSON objects: SDP, session tokens
- Binary data: audio chunks, audio with headers

**Problems:**
- No message versioning
- No message validation
- Parsing errors break connection
- Difficult to extend or debug

#### Fragile Message Parsing
Message handling uses string matching and try-catch for JSON parsing:

```typescript
if (evt.data === "START") { /* ... */ }
else if (evt.data.startsWith("pong")) { /* ... */ }
else {
    const message = JSON.parse(evt.data); // May throw!
}
```

**Better approach:** Discriminated unions with type guards.

---

## Proposed Architecture

### High-Level Structure

```
simli-sdk/
├── src/
│   ├── core/
│   │   ├── SimliClient.ts          // Facade/Coordinator
│   │   ├── ConnectionManager.ts     // Connection lifecycle
│   │   └── StateManager.ts          // State machine
│   ├── transport/
│   │   ├── WebRTCTransport.ts      // WebRTC abstraction
│   │   ├── WebSocketTransport.ts   // WebSocket abstraction
│   │   └── SignalingProtocol.ts    // Protocol definitions
│   ├── audio/
│   │   ├── AudioCapture.ts         // Microphone capture
│   │   ├── AudioProcessor.ts       // Processing pipeline
│   │   └── worklets/
│   │       └── audio-processor.worklet.ts
│   ├── media/
│   │   ├── MediaRenderer.ts        // Video/audio rendering
│   │   └── MediaSync.ts            // A/V synchronization
│   ├── session/
│   │   ├── SessionManager.ts       // Session lifecycle
│   │   ├── TokenManager.ts         // Authentication
│   │   └── IceServerProvider.ts    // ICE server management
│   ├── utils/
│   │   ├── EventEmitter.ts         // Type-safe events
│   │   ├── RetryStrategy.ts        // Exponential backoff
│   │   ├── TimeoutController.ts    // AbortController wrapper
│   │   └── Logger.ts               // Structured logging
│   ├── types/
│   │   ├── config.types.ts
│   │   ├── events.types.ts
│   │   ├── state.types.ts
│   │   └── protocol.types.ts
│   └── index.ts
└── tests/
    ├── unit/
    ├── integration/
    └── fixtures/
```

### Core Principles

#### 1. Separation of Concerns
Each module has a single, well-defined responsibility:

- **ConnectionManager**: Orchestrates connection establishment and recovery
- **WebRTCTransport**: Manages RTCPeerConnection lifecycle
- **WebSocketTransport**: Handles WebSocket communication
- **AudioCapture**: Captures and processes microphone input
- **MediaRenderer**: Renders incoming video/audio streams
- **SessionManager**: Manages session tokens and authentication
- **StateManager**: Enforces valid state transitions

#### 2. Dependency Injection
All dependencies are injected, enabling testing and flexibility:

```typescript
class ConnectionManager {
    constructor(
        private webrtcTransport: IWebRTCTransport,
        private wsTransport: IWebSocketTransport,
        private sessionManager: ISessionManager,
        private stateManager: StateManager,
        private logger: ILogger
    ) {}
}
```

#### 3. Interface-Based Design
Define interfaces for all major components:

```typescript
interface IWebRTCTransport {
    connect(iceServers: RTCIceServer[]): Promise<void>;
    disconnect(): Promise<void>;
    addTransceiver(kind: 'audio' | 'video', init: RTCRtpTransceiverInit): void;
    getConnectionState(): RTCPeerConnectionState;
    on(event: WebRTCEvent, handler: Function): void;
}
```

#### 4. State Machine
Explicit state management with finite state machine:

```typescript
enum ConnectionState {
    IDLE = 'idle',
    CONNECTING = 'connecting',
    AUTHENTICATING = 'authenticating',
    NEGOTIATING = 'negotiating',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    DISCONNECTING = 'disconnecting',
    DISCONNECTED = 'disconnected',
    FAILED = 'failed'
}

const transitions = {
    [ConnectionState.IDLE]: [ConnectionState.CONNECTING],
    [ConnectionState.CONNECTING]: [
        ConnectionState.AUTHENTICATING,
        ConnectionState.FAILED,
        ConnectionState.DISCONNECTING
    ],
    // ... more transitions
};
```

#### 5. Event-Driven Architecture
Components communicate through events rather than direct coupling:

```typescript
class WebRTCTransport extends TypedEventEmitter<WebRTCEvents> {
    private handleIceConnectionStateChange() {
        this.emit('iceConnectionStateChanged', {
            state: this.pc.iceConnectionState
        });
    }
}
```

#### 6. Resource Management
Explicit lifecycle management with cleanup guarantees:

```typescript
interface Disposable {
    dispose(): Promise<void>;
}

class ResourceManager {
    private resources: Disposable[] = [];
    
    register(resource: Disposable): void {
        this.resources.push(resource);
    }
    
    async disposeAll(): Promise<void> {
        // Dispose in reverse order
        for (const resource of this.resources.reverse()) {
            await resource.dispose().catch(err => 
                this.logger.error('Disposal failed', err)
            );
        }
        this.resources = [];
    }
}
```

---

## Detailed Component Design

### 1. StateManager

**Responsibility:** Enforce valid state transitions and maintain current state.

**Key Features:**
- Finite state machine with allowed transitions
- State history for debugging
- Middleware hooks for state changes
- Serializable state for persistence

**Benefits:**
- Impossible to reach invalid states
- Clear audit trail of state changes
- Easy to add guards and side effects
- Testable in isolation

### 2. ConnectionManager

**Responsibility:** Orchestrate the connection lifecycle.

**Key Features:**
- Coordinates WebRTC, WebSocket, and Session managers
- Implements retry strategy with exponential backoff
- Handles connection recovery and reconnection
- Provides connection health monitoring

**Benefits:**
- Single point of control for connection logic
- Consistent retry behavior
- Clear separation from transport details

### 3. WebRTCTransport

**Responsibility:** Encapsulate RTCPeerConnection operations.

**Key Features:**
- Creates and manages peer connection
- Handles ICE candidate gathering with proper events
- Manages transceivers for media
- Provides connection statistics

**Benefits:**
- Testable with mock RTCPeerConnection
- Reusable across different signaling protocols
- Clear contract for WebRTC operations

### 4. WebSocketTransport

**Responsibility:** Manage WebSocket communication.

**Key Features:**
- Connection lifecycle (connect, reconnect, disconnect)
- Message serialization/deserialization
- Message queue for offline buffering
- Heartbeat/ping mechanism

**Benefits:**
- Protocol-agnostic WebSocket wrapper
- Automatic reconnection logic
- Testable with mock WebSocket

### 5. SignalingProtocol

**Responsibility:** Define message formats and protocol logic.

**Key Features:**
- Type-safe message definitions
- Message validation with schemas
- Protocol versioning
- Message serialization

**Benefits:**
- Type safety for all messages
- Easy to extend protocol
- Version compatibility checking

### 6. AudioCapture

**Responsibility:** Capture and process microphone audio.

**Key Features:**
- MediaStream acquisition
- AudioWorklet integration (separate file)
- Configurable buffer sizes
- Backpressure handling

**Benefits:**
- Testable with mock MediaStream
- Optimizable audio pipeline
- Clear separation from transport

### 7. MediaRenderer

**Responsibility:** Render incoming media streams.

**Key Features:**
- Video/audio element management
- Stream synchronization
- Quality monitoring
- Fallback handling

**Benefits:**
- Testable with mock elements
- Reusable across different UIs
- Clear media playback logic

### 8. SessionManager

**Responsibility:** Manage session lifecycle and authentication.

**Key Features:**
- Token acquisition and refresh
- Session metadata management
- Authentication state tracking
- Token validation

**Benefits:**
- Centralized authentication logic
- Easy to add token refresh
- Testable with mock API

### 9. IceServerProvider

**Responsibility:** Provide and cache ICE servers.

**Key Features:**
- Fetch ICE servers from API
- Caching with TTL
- Fallback to STUN servers
- Retry logic

**Benefits:**
- Reduces API calls
- Consistent ICE server logic
- Independent retry strategy

---

## Implementation Strategy

### Phase 1: Foundation (Week 1-2)

**Goals:** Set up infrastructure and shared utilities.

**Tasks:**
1. Create project structure and build configuration
2. Implement TypedEventEmitter with proper typing
3. Build StateManager with FSM
4. Create Logger with log levels and structured output
5. Implement RetryStrategy with exponential backoff
6. Build TimeoutController using AbortController
7. Write comprehensive tests for utilities

**Deliverables:**
- Working build system
- Tested utility modules
- Type definitions for all core types

### Phase 2: Transport Layer (Week 3-4)

**Goals:** Implement WebRTC and WebSocket abstractions.

**Tasks:**
1. Define transport interfaces
2. Implement WebRTCTransport with event-driven design
3. Implement WebSocketTransport with reconnection
4. Define SignalingProtocol message types
5. Create protocol validators
6. Add transport-level tests

**Deliverables:**
- Fully functional transport layer
- Mock implementations for testing
- Protocol documentation

### Phase 3: Session & Media (Week 5-6)

**Goals:** Build session management and media handling.

**Tasks:**
1. Implement SessionManager with token management
2. Build IceServerProvider with caching
3. Create AudioCapture with worklet integration
4. Implement MediaRenderer for playback
5. Add media synchronization logic
6. Write integration tests

**Deliverables:**
- Session lifecycle management
- Audio capture pipeline
- Media rendering components

### Phase 4: Connection Orchestration (Week 7-8)

**Goals:** Implement high-level connection logic.

**Tasks:**
1. Build ConnectionManager coordinating all components
2. Implement comprehensive error handling
3. Add connection health monitoring
4. Create automatic recovery logic
5. Build resource management system
6. Add end-to-end tests

**Deliverables:**
- Working ConnectionManager
- Error recovery mechanisms
- Resource cleanup guarantees

### Phase 5: Client Facade & Polish (Week 9-10)

**Goals:** Create developer-friendly API and finish SDK.

**Tasks:**
1. Implement SimliClient facade
2. Add configuration validation
3. Create developer documentation
4. Build example applications
5. Performance optimization
6. Security audit

**Deliverables:**
- Complete SDK ready for release
- Documentation and examples
- Migration guide from old SDK

---

## Best Practices Applied

### WebRTC Best Practices

1. **Perfect Negotiation Pattern**
   - Implement perfect negotiation for robust connection setup
   - Handle glare conditions properly
   - Rollback on negotiation failures

2. **Proper ICE Handling**
   - Use `icegatheringstatechange` event, not polling
   - Implement trickle ICE correctly
   - Handle ICE restart scenarios

3. **Connection Quality Monitoring**
   - Track RTCStatsReport for connection health
   - Monitor packet loss, jitter, RTT
   - Implement adaptive quality mechanisms

4. **Graceful Degradation**
   - Fallback strategies for connection failures
   - TURN server usage when STUN fails
   - Clear error messages for unsupported features

### Modern JavaScript Best Practices

1. **Async/Await over Callbacks**
   - Use async/await for all async operations
   - Proper error handling with try-catch
   - AbortController for cancellation

2. **Immutability**
   - Immutable configuration objects
   - State updates create new state objects
   - Prevent accidental mutations

3. **TypeScript Strict Mode**
   - Enable all strict checks
   - No implicit any
   - Proper null checking

4. **Error Handling**
   - Custom error classes for different error types
   - Error boundaries for graceful degradation
   - Structured error information

5. **Testing**
   - High unit test coverage (>80%)
   - Integration tests for critical paths
   - E2E tests for user scenarios
   - Mock browser APIs properly

### Architecture Best Practices

1. **SOLID Principles**
   - Single Responsibility: Each class has one job
   - Open/Closed: Extend through composition
   - Liskov Substitution: Interfaces are substitutable
   - Interface Segregation: Minimal, focused interfaces
   - Dependency Inversion: Depend on abstractions

2. **Composition over Inheritance**
   - Use composition to build complex behavior
   - Avoid deep inheritance hierarchies
   - Favor aggregation and delegation

3. **Dependency Injection**
   - All dependencies injected through constructor
   - Use interfaces for dependencies
   - Enable easy mocking and testing

4. **Event-Driven Architecture**
   - Loose coupling through events
   - Clear event contracts
   - Proper event cleanup

---

## Migration Strategy

### Backward Compatibility

Create a compatibility layer that wraps the new SDK with the old API:

```typescript
// Legacy wrapper
class SimliClientLegacy {
    private client: SimliClient;
    
    Initialize(config: OldConfig) {
        const newConfig = adaptConfig(config);
        this.client = new SimliClient(newConfig);
    }
    
    async start() {
        return this.client.connect();
    }
    
    // ... map all old methods
}
```

### Gradual Migration Path

1. **Phase 1:** Release new SDK alongside old one
2. **Phase 2:** Deprecate old SDK with migration guide
3. **Phase 3:** Provide automated migration tools
4. **Phase 4:** Remove old SDK after grace period

### Breaking Changes

Document all breaking changes:
- Configuration structure changes
- Event name changes
- Method signature changes
- State property removals

---

## Performance Optimizations

### 1. Reduce Bundle Size
- Tree-shaking friendly exports
- Code splitting for optional features
- Remove unnecessary dependencies
- Minimize polyfills

### 2. Memory Efficiency
- Object pooling for frequent allocations
- Efficient data structures
- Proper cleanup of closures
- WeakMap for caching

### 3. Network Optimization
- Message batching when appropriate
- Binary protocol over JSON
- Compression for large messages
- Reduce unnecessary roundtrips

### 4. Audio Pipeline
- Optimize buffer sizes dynamically
- Use SharedArrayBuffer if available
- Minimize copies and allocations
- Efficient encoding/decoding

---

## Security Considerations

### 1. Input Validation
- Validate all configuration inputs
- Sanitize WebSocket messages
- Validate SDP before applying
- Check message origins

### 2. Secure Defaults
- Use secure WebSocket (wss://)
- Require HTTPS for production
- Implement CSP-friendly design
- No eval() or Function()

### 3. Token Management
- Secure token storage
- Token expiration handling
- Prevent token leakage in logs
- Implement token refresh

### 4. Error Messages
- Don't leak sensitive information
- Generic messages to end users
- Detailed logs for debugging only
- Sanitize error contexts

---

## Monitoring & Observability

### 1. Structured Logging
```typescript
logger.info('Connection attempt started', {
    attempt: retryAttempt,
    iceServers: iceServers.length,
    timestamp: Date.now()
});
```

### 2. Metrics Collection
- Connection success/failure rates
- Average connection time
- Audio quality metrics
- Error frequency by type

### 3. Debug Tools
- Connection state visualizer
- Event timeline viewer
- WebRTC stats dashboard
- Message inspector

---

## Conclusion

The proposed refactoring transforms the Simli SDK from a monolithic, hard-to-maintain codebase into a modular, testable, and extensible architecture. The investment in proper separation of concerns, state management, and best practices will pay dividends in:

- **Reliability:** Fewer bugs through better error handling and testing
- **Maintainability:** Clear code structure makes changes easier
- **Performance:** Optimized architecture reduces overhead
- **Developer Experience:** Better API, documentation, and debugging tools
- **Extensibility:** Easy to add new features without breaking existing code

This refactoring is not just a code cleanup—it's a foundation for long-term success of the Simli SDK.
