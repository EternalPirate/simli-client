# Simli Client - Modular Architecture

## Overview

Simli WebRTC avatar client - completely refactored from monolithic to modular architecture with **SimliClientV2** offering a clean, modern API.

## Installation

```bash
npm install simli-client
```

## Quick Start (V2)

```typescript
import { SimliClientV2 } from 'simli-client';

const client = new SimliClientV2({
  apiKey: process.env.SIMLI_API_KEY!,
  faceID: process.env.SIMLI_FACE_ID!,
  videoElement: document.getElementById('video') as HTMLVideoElement,
  audioElement: document.getElementById('audio') as HTMLAudioElement,
});

// Events
client.on('connected', () => console.log('Connected'));
client.on('firstFrame', () => console.log('Video ready'));

// Connect
await client.connect();
await client.startAudioCapture();
```

## Two APIs Available

### SimliClient (V1 - Legacy)
Original monolithic client, preserved for backward compatibility.

```typescript
const simli = new SimliClient();
simli.Initialize({ apiKey, faceID, videoRef, audioRef });
simli.start();
```

### SimliClientV2 (Recommended)
Modern modular client with clean Promise-based API.

```typescript
const client = new SimliClientV2({ apiKey, faceID, videoElement, audioElement });
await client.connect();
```

## Architecture

Built on a **6-layer modular architecture**:

1. **Utils** - EventEmitter, Logger, RetryStrategy, TimeoutController (✅ 78 tests)
2. **Transport** - WebSocket, WebRTC, TransportManager
3. **Core** - ConnectionManager, StateManager, ConfigValidator
4. **Audio** - AudioProcessor, AudioStreamManager
5. **Media** - VideoRenderer, MediaStreamManager
6. **Session** - SessionManager

## SimliClientV2 API

### Configuration

```typescript
interface SimliClientV2Config {
  // Required
  apiKey: string;
  faceID: string;
  videoElement: HTMLVideoElement;
  audioElement: HTMLAudioElement;
  
  // Optional
  model?: 'fasttalk' | 'artalk';  // default: 'artalk'
  handleSilence?: boolean;        // default: true
  maxSessionLength?: number;      // default: 3600 seconds
  maxIdleTime?: number;           // default: 600 seconds
  enableLogging?: boolean;        // default: false
}
```

### Methods

**Connection**
- `connect(): Promise<void>` - Connect to Simli
- `disconnect(): Promise<void>` - Disconnect
- `isConnected(): boolean` - Check status
- `getState(): ConnectionStateType` - Get state

**Audio**
- `startAudioCapture(): Promise<void>` - Start mic
- `stopAudioCapture(): void` - Stop mic
- `sendAudioData(data: Uint8Array, immediate?: boolean): void` - Send audio
- `clearBuffer(): void` - Clear buffer

**Stats**
- `getSessionInfo()` - Session info
- `getStats()` - Comprehensive stats

**Cleanup**
- `destroy(): Promise<void>` - Cleanup resources

### Events

- `connected` - Connection established
- `disconnected` - Connection lost
- `sessionStarted` - Session started
- `sessionEnded` - Session ended
- `videoReady` - Video stream ready
- `firstFrame` - First video frame
- `speaking` - Avatar speaking
- `silent` - Avatar silent
- `error` - Error with context

## Complete Example

```typescript
import { SimliClientV2 } from 'simli-client';

const client = new SimliClientV2({
  apiKey: 'your-api-key',
  faceID: 'your-face-id',
  videoElement: document.getElementById('avatar-video') as HTMLVideoElement,
  audioElement: document.getElementById('avatar-audio') as HTMLAudioElement,
  enableLogging: true,
});

// Setup events
client.on('connected', () => console.log('✓ Connected'));
client.on('sessionStarted', ({ sessionId }) => console.log('Session:', sessionId));
client.on('firstFrame', () => console.log('✓ Video ready'));
client.on('speaking', () => console.log('Avatar speaking'));
client.on('error', ({ error, context }) => console.error(context, error));

// Connect and start
await client.connect();
await client.startAudioCapture();

// Get stats
const stats = client.getStats();
console.log('Stats:', stats);

// Cleanup
await client.disconnect();
await client.destroy();
```

## Migration from V1

**Before (V1):**
```typescript
const simli = new SimliClient();
simli.Initialize({
  apiKey: 'key',
  faceID: 'face',
  handleSilence: true,
  videoRef: videoEl,
  audioRef: audioEl,
});
simli.start();
```

**After (V2):**
```typescript
const client = new SimliClientV2({
  apiKey: 'key',
  faceID: 'face',
  handleSilence: true,
  videoElement: videoEl,
  audioElement: audioEl,
});
await client.connect();
```

**Key Changes:**
- Constructor takes full config (not `Initialize()`)
- All methods use `async/await`
- `videoElement`/`audioElement` instead of `videoRef`/`audioRef`
- `connect()` instead of `start()`
- `destroy()` instead of `close()`

## Features

✅ **Type-Safe** - Full TypeScript support  
✅ **Modular** - Clean separation of concerns  
✅ **Event-Driven** - Type-safe events  
✅ **Auto-Reconnect** - Exponential backoff  
✅ **State Management** - Comprehensive tracking  
✅ **Session Management** - Auto-timeouts, stats  
✅ **Resource Cleanup** - Proper destroy()  
✅ **Logging** - Configurable debug logs  

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 15+

Requires: WebRTC, WebSocket, Audio Worklet, MediaStream

## Documentation

- **V2 Guide**: [SIMLI_V2_USAGE.md](./SIMLI_V2_USAGE.md)
- **API Docs**: [docs.simli.com](https://docs.simli.com)
- **Architecture**: [SIMLI_SDK_REFACTORING_PROPOSAL.md](./SIMLI_SDK_REFACTORING_PROPOSAL.md)

## Project Structure

```
src/
├── SimliClient.ts          # V1 (legacy)
├── SimliClientV2.ts        # V2 (modern)
├── audio/                  # Audio processing
├── core/                   # Business logic
├── media/                  # Video/audio playback
├── session/                # Session management
├── transport/              # WebSocket/WebRTC
├── types/                  # TypeScript types
└── utils/                  # Utilities (✅ 78 tests)
```

## License

MIT

## Support

- Issues: [GitHub Issues](https://github.com/EternalPirate/simli-client/issues)
- Docs: [docs.simli.com](https://docs.simli.com)
