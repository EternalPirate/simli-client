# Simli Client V2 - Usage Guide

## Overview

SimliClientV2 is a modern, modular WebRTC-based avatar client with a clean Promise-based API, full TypeScript support, and comprehensive state management.

## Installation

```bash
npm install simli-client
```

## Quick Start

```typescript
import { SimliClientV2 } from 'simli-client';

// Get video and audio elements
const videoElement = document.getElementById('avatar-video') as HTMLVideoElement;
const audioElement = document.getElementById('avatar-audio') as HTMLAudioElement;

// Create client
const client = new SimliClientV2({
  apiKey: 'your-api-key',
  faceID: 'your-face-id',
  videoElement,
  audioElement,
  enableLogging: true,
});

// Setup event listeners
client.on('connected', () => {
  console.log('Connected to Simli');
});

client.on('sessionStarted', ({ sessionId }) => {
  console.log('Session started:', sessionId);
});

client.on('videoReady', () => {
  console.log('Video stream ready');
});

client.on('firstFrame', () => {
  console.log('First frame received');
});

client.on('speaking', () => {
  console.log('Avatar is speaking');
});

client.on('silent', () => {
  console.log('Avatar is silent');
});

client.on('error', ({ error, context }) => {
  console.error('Error:', error, 'Context:', context);
});

// Connect
await client.connect();

// Start audio capture from microphone
await client.startAudioCapture();

// Or send audio data manually
const audioData = new Uint8Array([...]); // PCM16 audio data
client.sendAudioData(audioData);

// Clear audio buffer
client.clearBuffer();

// Stop audio capture
client.stopAudioCapture();

// Disconnect
await client.disconnect();

// Cleanup
await client.destroy();
```

## Configuration

### Required Options

```typescript
interface SimliClientV2Config {
  // Required
  apiKey: string;              // Your Simli API key
  faceID: string;              // Face ID to use
  videoElement: HTMLVideoElement;  // Video element for rendering
  audioElement: HTMLAudioElement;  // Audio element for playback
}
```

### Optional Options

```typescript
interface SimliClientV2Config {
  // Optional
  sessionToken?: string;           // Pre-authenticated session token
  model?: 'fasttalk' | 'artalk';  // Model to use (default: 'artalk')
  handleSilence?: boolean;         // Handle silence detection (default: true)
  maxSessionLength?: number;       // Max session duration in seconds (default: 3600)
  maxIdleTime?: number;           // Max idle time in seconds (default: 600)
  maxRetryAttempts?: number;      // Max reconnection attempts (default: 100)
  retryDelay?: number;            // Retry delay in ms (default: 2000)
  enableSFU?: boolean;            // Enable SFU mode (default: true)
  simliURL?: string;              // Simli API URL (default: 's://api.simli.ai')
  enableLogging?: boolean;        // Enable debug logging (default: false)
}
```

## API Reference

### Connection

#### `connect(): Promise<void>`

Connect to Simli service and start session.

```typescript
await client.connect();
```

#### `disconnect(): Promise<void>`

Disconnect from Simli service and end session.

```typescript
await client.disconnect();
```

#### `isConnected(): boolean`

Check if client is connected.

```typescript
if (client.isConnected()) {
  console.log('Connected');
}
```

#### `getState(): ConnectionStateType`

Get current connection state.

```typescript
const state = client.getState();
// Returns: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'
```

### Audio

#### `startAudioCapture(): Promise<void>`

Start capturing audio from user's microphone.

```typescript
await client.startAudioCapture();
```

#### `stopAudioCapture(): void`

Stop audio capture.

```typescript
client.stopAudioCapture();
```

#### `sendAudioData(data: Uint8Array, immediate?: boolean): void`

Send PCM16 audio data to avatar.

```typescript
const audioData = new Uint8Array([...]);
client.sendAudioData(audioData);

// Send immediately (skip queuing)
client.sendAudioData(audioData, true);
```

#### `clearBuffer(): void`

Clear the audio buffer.

```typescript
client.clearBuffer();
```

### Statistics

#### `getSessionInfo(): SessionInfo`

Get current session information.

```typescript
const info = client.getSessionInfo();
console.log('Session ID:', info.sessionId);
console.log('Duration:', info.duration);
console.log('Bytes sent:', info.bytesSent);
```

#### `getStats(): Stats`

Get comprehensive statistics.

```typescript
const stats = client.getStats();
console.log('Connection:', stats.connection);
console.log('Session:', stats.session);
console.log('Media:', stats.media);
console.log('State:', stats.state);
```

### Cleanup

#### `destroy(): Promise<void>`

Destroy client and cleanup all resources.

```typescript
await client.destroy();
```

## Events

### Connection Events

#### `connected`

Emitted when connected to Simli service.

```typescript
client.on('connected', () => {
  console.log('Connected');
});
```

#### `disconnected`

Emitted when disconnected from service.

```typescript
client.on('disconnected', ({ reason }) => {
  console.log('Disconnected:', reason);
});
```

#### `reconnecting`

Emitted when attempting to reconnect.

```typescript
client.on('reconnecting', ({ attempt }) => {
  console.log('Reconnection attempt:', attempt);
});
```

#### `stateChange`

Emitted when connection state changes.

```typescript
client.on('stateChange', ({ state }) => {
  console.log('State changed to:', state);
});
```

### Session Events

#### `sessionStarted`

Emitted when session starts.

```typescript
client.on('sessionStarted', ({ sessionId }) => {
  console.log('Session started:', sessionId);
});
```

#### `sessionEnded`

Emitted when session ends.

```typescript
client.on('sessionEnded', ({ sessionId, duration }) => {
  console.log('Session ended:', sessionId, 'Duration:', duration);
});
```

### Media Events

#### `videoReady`

Emitted when video stream is ready.

```typescript
client.on('videoReady', () => {
  console.log('Video ready');
});
```

#### `audioReady`

Emitted when audio stream is ready.

```typescript
client.on('audioReady', () => {
  console.log('Audio ready');
});
```

#### `firstFrame`

Emitted when first video frame is received.

```typescript
client.on('firstFrame', () => {
  console.log('First frame received');
});
```

### Avatar State Events

#### `speaking`

Emitted when avatar starts speaking.

```typescript
client.on('speaking', () => {
  console.log('Avatar speaking');
});
```

#### `silent`

Emitted when avatar becomes silent.

```typescript
client.on('silent', () => {
  console.log('Avatar silent');
});
```

### Error Events

#### `error`

Emitted on errors.

```typescript
client.on('error', ({ error, context }) => {
  console.error('Error:', error.message);
  console.error('Context:', context); // 'connection' | 'transport' | 'media' | 'audio'
});
```

## Complete Example

```typescript
import { SimliClientV2 } from 'simli-client';

async function main() {
  // Get DOM elements
  const videoElement = document.getElementById('avatar-video') as HTMLVideoElement;
  const audioElement = document.getElementById('avatar-audio') as HTMLAudioElement;
  const startButton = document.getElementById('start-btn') as HTMLButtonElement;
  const stopButton = document.getElementById('stop-btn') as HTMLButtonElement;
  const muteButton = document.getElementById('mute-btn') as HTMLButtonElement;

  // Create client
  const client = new SimliClientV2({
    apiKey: process.env.SIMLI_API_KEY!,
    faceID: process.env.SIMLI_FACE_ID!,
    videoElement,
    audioElement,
    model: 'artalk',
    handleSilence: true,
    enableLogging: true,
  });

  // Setup event listeners
  client.on('connected', () => {
    console.log('✓ Connected');
    startButton.disabled = false;
  });

  client.on('sessionStarted', ({ sessionId }) => {
    console.log('✓ Session started:', sessionId);
  });

  client.on('videoReady', () => {
    console.log('✓ Video ready');
  });

  client.on('firstFrame', () => {
    console.log('✓ First frame received');
    videoElement.style.opacity = '1';
  });

  client.on('speaking', () => {
    videoElement.classList.add('speaking');
  });

  client.on('silent', () => {
    videoElement.classList.remove('speaking');
  });

  client.on('error', ({ error, context }) => {
    console.error('✗ Error in', context, ':', error);
  });

  client.on('disconnected', ({ reason }) => {
    console.log('Disconnected:', reason);
    startButton.disabled = true;
    stopButton.disabled = true;
    muteButton.disabled = true;
  });

  // Button handlers
  let isAudioCapturing = false;

  startButton.addEventListener('click', async () => {
    try {
      await client.connect();
      await client.startAudioCapture();
      isAudioCapturing = true;
      startButton.disabled = true;
      stopButton.disabled = false;
      muteButton.disabled = false;
    } catch (error) {
      console.error('Failed to start:', error);
    }
  });

  stopButton.addEventListener('click', async () => {
    try {
      await client.disconnect();
      isAudioCapturing = false;
      startButton.disabled = false;
      stopButton.disabled = true;
      muteButton.disabled = true;
    } catch (error) {
      console.error('Failed to stop:', error);
    }
  });

  muteButton.addEventListener('click', () => {
    if (isAudioCapturing) {
      client.stopAudioCapture();
      isAudioCapturing = false;
      muteButton.textContent = 'Unmute';
    } else {
      client.startAudioCapture();
      isAudioCapturing = true;
      muteButton.textContent = 'Mute';
    }
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', async () => {
    await client.destroy();
  });

  // Display stats every 5 seconds
  setInterval(() => {
    if (client.isConnected()) {
      const stats = client.getStats();
      console.log('Stats:', {
        duration: stats.session.duration,
        bytesSent: stats.session.bytesSent,
        audioPackets: stats.session.audioPackets,
        videoFrames: stats.session.videoFrames,
      });
    }
  }, 5000);
}

main().catch(console.error);
```

## HTML Setup

```html
<!DOCTYPE html>
<html>
<head>
  <title>Simli Avatar</title>
  <style>
    #avatar-video {
      width: 640px;
      height: 480px;
      background: black;
      opacity: 0;
      transition: opacity 0.3s;
    }
    
    #avatar-video.speaking {
      border: 3px solid green;
    }
  </style>
</head>
<body>
  <h1>Simli Avatar Demo</h1>
  
  <video id="avatar-video" autoplay playsinline></video>
  <audio id="avatar-audio" autoplay></audio>
  
  <div>
    <button id="start-btn">Start</button>
    <button id="stop-btn" disabled>Stop</button>
    <button id="mute-btn" disabled>Mute</button>
  </div>
  
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

## Migration from V1

### Before (V1)

```typescript
const simliClient = new SimliClient();

simliClient.Initialize({
  apiKey: 'key',
  faceID: 'face',
  // ... many options
});

simliClient.start();
```

### After (V2)

```typescript
const client = new SimliClientV2({
  apiKey: 'key',
  faceID: 'face',
  videoElement,
  audioElement,
});

await client.connect();
```

### Key Differences

1. **Constructor**: V2 takes full config in constructor
2. **Async/Await**: V2 uses Promises throughout
3. **Type Safety**: V2 has comprehensive TypeScript support
4. **Events**: V2 uses type-safe EventEmitter
5. **Modular**: V2 is built on modular architecture
6. **Cleaner API**: V2 has fewer, more focused methods

## Best Practices

1. **Always cleanup**: Call `destroy()` when done
2. **Handle errors**: Listen to `error` events
3. **Check state**: Use `isConnected()` before operations
4. **Monitor stats**: Use `getStats()` for diagnostics
5. **Enable logging**: Use `enableLogging: true` during development

## Troubleshooting

### No video appears

- Check `videoReady` event is fired
- Ensure video element is in DOM
- Check browser console for errors

### No audio capture

- Check microphone permissions
- Verify `audioReady` event is fired
- Check browser compatibility

### Connection fails

- Verify API key is valid
- Check network connectivity
- Look at `error` events for details

### Poor performance

- Check `getStats()` for bandwidth usage
- Reduce video quality if needed
- Monitor session duration

## License

MIT
