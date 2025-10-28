# Simli SDK Refactoring - Implementation Guide

## Strategy: How to Implement & Test Without Breaking Your App

### The Problem
You want to refactor the Simli SDK but:
- Can't modify `node_modules` (changes get wiped on `npm install`)
- Don't want to break your existing app
- Want to test changes before contributing back
- Need a smooth transition path

### The Solution: Multi-Phase Approach

---

## Phase 1: Create a Local Fork (Week 1)

### Step 1: Fork the Repository

```bash
# 1. Go to GitHub and fork simli-ai/simli-client
# 2. Clone YOUR fork locally (NOT in mvp-frontend)

cd ~/PROJECTS/
git clone https://github.com/EternalPirate/simli-client.git
cd simli-client

# 3. Add original repo as upstream
git remote add upstream https://github.com/simli-ai/simli-client.git

# 4. Create refactor branch
git checkout -b refactor/modular-architecture
```

### Step 2: Setup Development Environment

```bash
cd ~/PROJECTS/simli-client

# Install dependencies
npm install

# Install development dependencies
npm install --save-dev \
  typescript@latest \
  @types/node \
  jest \
  @types/jest \
  ts-jest \
  @testing-library/jest-dom \
  eslint \
  prettier \
  rollup \
  @rollup/plugin-typescript

# Initialize tsconfig with strict mode
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
EOF
```

### Step 3: Link to Your App for Testing

```bash
# In simli-client directory
npm link

# In your mvp-frontend directory
cd ~/PROJECTS/AILUNA/mvp-frontend
npm link simli-client

# Now changes in ~/PROJECTS/simli-client will reflect in your app!
```

**Important:** After linking, any rebuild in simli-client will be available in your app immediately.

---

## Phase 2: Create Wrapper (Week 1-2) - Quick Fix

Before full refactoring, create a wrapper that fixes critical issues while maintaining backward compatibility.

### Create Wrapper in YOUR App

```bash
cd ~/PROJECTS/AILUNA/mvp-frontend

# Create wrapper directory
mkdir -p src/lib/simli-wrapper
```

Create these files in your app:

**File: `src/lib/simli-wrapper/SimliClientWrapper.ts`**

This wrapper fixes critical issues without touching the SDK:

```typescript
import { SimliClient, SimliClientConfig } from 'simli-client';

/**
 * Wrapper around SimliClient that fixes critical issues:
 * - Proper resource cleanup
 * - Memory leak prevention
 * - Better error handling
 * - State management
 */
export class SimliClientWrapper {
  private client: SimliClient;
  private eventCleanup: Array<() => void> = [];
  private isDisposed = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 3;

  constructor(private config: SimliClientConfig) {
    this.client = new SimliClient();
    this.client.Initialize(config);
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Track event handlers for cleanup
    const onConnected = () => {
      console.log('[SimliWrapper] Connected');
      this.reconnectAttempts = 0;
    };

    const onDisconnected = () => {
      console.log('[SimliWrapper] Disconnected');
      if (!this.isDisposed && this.reconnectAttempts < this.MAX_RECONNECT) {
        this.handleReconnect();
      }
    };

    const onFailed = (reason: string) => {
      console.error('[SimliWrapper] Failed:', reason);
      // Don't auto-reconnect on failure, let app decide
    };

    this.client.on('connected', onConnected);
    this.client.on('disconnected', onDisconnected);
    this.client.on('failed', onFailed);

    // Store cleanup functions
    this.eventCleanup.push(
      () => this.client.off('connected', onConnected),
      () => this.client.off('disconnected', onDisconnected),
      () => this.client.off('failed', onFailed)
    );
  }

  private async handleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    
    console.log(`[SimliWrapper] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    if (!this.isDisposed) {
      try {
        await this.client.start();
      } catch (error) {
        console.error('[SimliWrapper] Reconnect failed:', error);
      }
    }
  }

  async start() {
    if (this.isDisposed) {
      throw new Error('SimliClientWrapper has been disposed');
    }
    return this.client.start();
  }

  close() {
    if (this.isDisposed) return;
    
    console.log('[SimliWrapper] Closing connection');
    this.client.close();
  }

  async dispose() {
    if (this.isDisposed) return;
    
    console.log('[SimliWrapper] Disposing wrapper');
    this.isDisposed = true;
    
    // Remove all event listeners
    this.eventCleanup.forEach(cleanup => cleanup());
    this.eventCleanup = [];
    
    // Close client
    this.client.close();
    
    // Clear reference
    (this.client as any) = null;
  }

  // Proxy other methods
  on(event: any, callback: any) {
    return this.client.on(event, callback);
  }

  off(event: any, callback: any) {
    return this.client.off(event, callback);
  }

  listenToMediastreamTrack(stream: MediaStreamTrack) {
    return this.client.listenToMediastreamTrack(stream);
  }

  sendAudioData(data: Uint8Array) {
    return this.client.sendAudioData(data);
  }

  ClearBuffer() {
    return this.client.ClearBuffer();
  }

  isConnected() {
    return this.client.isConnected();
  }

  getConnectionStatus() {
    return this.client.getConnectionStatus();
  }
}
```

**Usage in your app:**

```typescript
// Replace:
// import { SimliClient } from 'simli-client';
// with:
import { SimliClientWrapper } from '@/lib/simli-wrapper/SimliClientWrapper';

// Then use exactly the same way:
const client = new SimliClientWrapper(config);
await client.start();

// Don't forget cleanup!
client.dispose();
```

---

## Phase 3: Incremental Refactoring (Week 2-10)

Now work in the forked `simli-client` repository.

### Week 2-3: Foundation

**In `~/PROJECTS/simli-client/`:**

```bash
# Create new structure
mkdir -p src/{core,transport,audio,media,session,utils,types}

# Create utility files first
touch src/utils/{EventEmitter.ts,Logger.ts,RetryStrategy.ts,TimeoutController.ts}
touch src/types/{config.types.ts,events.types.ts,state.types.ts,protocol.types.ts}
```

### Build Utilities First

**File: `src/utils/Logger.ts`**

```typescript
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

export interface ILogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

export class Logger implements ILogger {
  constructor(
    private prefix: string = 'SIMLI',
    private level: LogLevel = LogLevel.INFO
  ) {}

  debug(message: string, meta?: any) {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(`[${this.prefix}:DEBUG]`, message, meta || '');
    }
  }

  info(message: string, meta?: any) {
    if (this.level <= LogLevel.INFO) {
      console.log(`[${this.prefix}:INFO]`, message, meta || '');
    }
  }

  warn(message: string, meta?: any) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[${this.prefix}:WARN]`, message, meta || '');
    }
  }

  error(message: string, meta?: any) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[${this.prefix}:ERROR]`, message, meta || '');
    }
  }
}
```

Build one component at a time, test it, then move to next.

### Testing Strategy

**File: `src/utils/__tests__/Logger.test.ts`**

```typescript
import { Logger, LogLevel } from '../Logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should log info messages when level is INFO', () => {
    const logger = new Logger('TEST', LogLevel.INFO);
    logger.info('test message');
    expect(consoleLogSpy).toHaveBeenCalledWith('[TEST:INFO]', 'test message', '');
  });

  it('should not log debug messages when level is INFO', () => {
    const logger = new Logger('TEST', LogLevel.INFO);
    logger.debug('test message');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});
```

Run tests:
```bash
npm test
```

### Integration Testing in Your App

After building components in the forked SDK:

```bash
# In simli-client directory
npm run build

# Changes automatically reflect in linked mvp-frontend
# Test in your app immediately!
```

---

## Phase 4: Parallel Development Strategy

### Keep Both Versions

**Option A: Feature Flag**

In your app, add a feature flag:

```typescript
// src/config/features.ts
export const FEATURES = {
  USE_NEW_SIMLI_SDK: import.meta.env.VITE_USE_NEW_SIMLI ?? false
};

// In your component
import { FEATURES } from '@/config/features';

if (FEATURES.USE_NEW_SIMLI_SDK) {
  // Use new refactored SDK
  import { SimliClient } from 'simli-client/v2';
} else {
  // Use wrapper around old SDK
  import { SimliClientWrapper } from '@/lib/simli-wrapper';
}
```

**Option B: Separate Package**

Publish your fork as scoped package:

```bash
# In simli-client fork
# Update package.json
{
  "name": "@ckailuna/simli-client",
  "version": "2.0.0-alpha.1"
}

# Publish to npm (or GitHub packages)
npm publish --access=public
```

In your app:
```bash
npm install @ckailuna/simli-client
```

Now you have both:
```typescript
import { SimliClient as OldClient } from 'simli-client'; // Original
import { SimliClient as NewClient } from '@ckailuna/simli-client'; // Your fork
```

---

## Phase 5: Contributing Back to Original Repo

### Prepare for Pull Request

```bash
cd ~/PROJECTS/simli-client

# Make sure you're on your refactor branch
git checkout refactor/modular-architecture

# Sync with upstream
git fetch upstream
git rebase upstream/main

# Run all tests
npm test

# Build and verify
npm run build

# Create comprehensive PR description
```

### PR Strategy

**Option 1: Monolithic PR (Not Recommended)**
- Submit entire refactor as one PR
- Hard to review
- Likely to be rejected

**Option 2: Incremental PRs (Recommended)**

Break into smaller PRs:

1. **PR #1: Add utilities and types** (Week 3)
   - Logger, EventEmitter, RetryStrategy
   - Type definitions
   - Tests
   - Zero breaking changes

2. **PR #2: Extract WebSocket transport** (Week 4)
   - WebSocketTransport class
   - Use in existing code
   - Tests

3. **PR #3: Extract WebRTC transport** (Week 5)
   - WebRTCTransport class
   - Use in existing code
   - Tests

4. **PR #4: Add StateManager** (Week 6)
   - State machine
   - Integration with existing code
   - Tests

5. **PR #5: Refactor main client** (Week 7-8)
   - Use all new components
   - Maintain backward compatibility
   - Tests

### PR Template

```markdown
## Description
Extracts WebSocket logic into separate transport class for better testability and maintainability.

## Motivation
- Current implementation mixes WebSocket logic with WebRTC and audio
- Hard to test in isolation
- Difficult to add reconnection logic

## Changes
- Created `WebSocketTransport` class
- Added comprehensive tests
- Maintains 100% backward compatibility
- No breaking changes

## Testing
- Added unit tests (see src/transport/__tests__)
- Tested in production app for 2 weeks
- All existing tests pass

## Screenshots/Logs
[If applicable]

## Checklist
- [x] Tests added/updated
- [x] Documentation updated
- [x] No breaking changes
- [x] Tested in production
```

---

## Phase 6: What If They Don't Accept Your PR?

### Options:

**Option 1: Maintain Your Fork**

Keep your fork as the "better" version:

```json
// package.json in your app
{
  "dependencies": {
    "simli-client": "github:ckailuna/simli-client#refactor/modular-architecture"
  }
}
```

**Option 2: Create Separate Package**

Publish as `simli-client-enhanced`:

```bash
cd ~/PROJECTS/simli-client

# Rename package
# package.json
{
  "name": "simli-client-enhanced",
  "description": "Enhanced version of Simli SDK with better architecture"
}

npm publish
```

**Option 3: Wrapper Package**

Create wrapper package that uses their SDK internally but provides better API:

```typescript
// Your wrapper package
import { SimliClient as OriginalClient } from 'simli-client';

export class SimliClient {
  // Your improved implementation wrapping theirs
}
```

---

## Testing Checklist

### Unit Tests
- [ ] All utilities have >90% coverage
- [ ] All transports tested in isolation
- [ ] State machine transitions tested
- [ ] Error handling tested

### Integration Tests
- [ ] Full connection flow
- [ ] Reconnection scenarios
- [ ] Error recovery
- [ ] Resource cleanup

### Manual Testing in Your App
- [ ] Initial connection works
- [ ] Audio streaming works
- [ ] Video rendering works
- [ ] Reconnection works
- [ ] No memory leaks (check DevTools)
- [ ] Error handling works
- [ ] Cleanup on unmount works

### Performance Testing
- [ ] Connection time < 5s
- [ ] Memory usage stable over time
- [ ] Audio latency acceptable
- [ ] CPU usage reasonable

---

## Rollback Plan

If something breaks:

```bash
# In your app
npm unlink simli-client
npm install simli-client@latest

# Or if using git dependency
# package.json
{
  "dependencies": {
    "simli-client": "^1.2.15"  // Back to published version
  }
}
```

---

## Timeline Summary

| Week | Activity | Location |
|------|----------|----------|
| 1 | Fork repo, setup dev env, create wrapper | Both |
| 2 | Build utilities, types, tests | Fork |
| 3 | Build transport layer | Fork |
| 4 | Build session/media components | Fork |
| 5-6 | Build connection manager | Fork |
| 7 | Integrate everything | Fork |
| 8 | Test in production app | App |
| 9 | Prepare PRs | Fork |
| 10 | Submit PRs, documentation | Fork |

---

## Best Practices Summary

### ✅ DO:
- Fork and work in separate repo
- Use `npm link` for local testing
- Write tests for everything
- Make incremental PRs
- Maintain backward compatibility
- Document everything
- Test in production (your app) before PR

### ❌ DON'T:
- Modify node_modules directly
- Make breaking changes without migration path
- Submit massive PR without discussion
- Skip tests
- Force your solution without maintainer input
- Assume your PR will be accepted

---

## Communication with Simli Team

### Before Starting
1. Open GitHub issue describing problems
2. Propose architecture in issue
3. Get feedback from maintainers
4. Adjust plan based on feedback

### During Development
1. Keep issue updated with progress
2. Share intermediate results
3. Ask for guidance on approach
4. Be open to alternatives

### When Submitting PR
1. Reference issue in PR
2. Explain benefits clearly
3. Show metrics/improvements
4. Provide migration guide
5. Be responsive to feedback

---

## Quick Start Commands

```bash
# 1. Fork on GitHub, then:
cd ~/PROJECTS
git clone https://github.com/EternalPirate/simli-client.git
cd simli-client
npm install
npm link

# 2. Link to your app
cd ~/PROJECTS/AILUNA/mvp-frontend
npm link simli-client

# 3. Start developing
cd ~/PROJECTS/simli-client
npm run dev  # Watch mode

# 4. Test in your app
cd ~/PROJECTS/AILUNA/mvp-frontend
npm run dev  # Your changes reflect automatically!

# 5. When done, unlink
cd ~/PROJECTS/AILUNA/mvp-frontend
npm unlink simli-client
npm install  # Restore normal version
```

Good luck! 🚀
