# Video Encoder Core Library

This directory contains the core encoding and demuxing logic for the browser-based video encoder.

## Architecture

```txt
Input MP4 File
      ↓
   demuxer.js ────────→ Detects tracks (video + audio?)
      ↓                         ↓
  Decoding                  onReady(hasAudio)
      ↓                         ↓
 Raw Frames              encoder.js ← Initializes muxer based on hasAudio
      ↓                         ↓
  Re-encoding              Creates appropriate tracks
      ↓                         ↓
 Encoded Chunks          Output MP4 (video only OR video+audio)
      ↓
 mp4-muxer
      ↓
FileSystem API (output.mp4)
```

### Progress Reporting

The encoding process is divided into two phases with separate progress tracking:

- **Loading Phase (0-10%)**: File reading and demuxing with MP4Box
  - Important on Android where file reading can take significant time
- **Encoding Phase (10-100%)**: Video/audio encoding with WebCodecs
  - The main processing phase

The UI displays three progress bars:
1. **Loading Progress**: File reading and demuxing (0-100%)
2. **Encoding Progress**: Actual encoding (0-100%)
3. **Overall Progress**: Combined progress (0-100%)

## Files

### demuxer.js

Responsible for:

- Parsing input MP4 files using mp4box.js
- Extracting video and audio tracks
- **Detecting whether source has audio** (important for the fix)
- Feeding encoded chunks to WebCodecs decoders
- Calling `onReady(hasAudio)` callback when metadata is available

**Key Feature**: Returns `hasAudio` flag to prevent creating empty audio tracks

### encoder.js

Responsible for:

- Setting up WebCodecs encoders (VideoEncoder, AudioEncoder)
- Configuring mp4-muxer with appropriate tracks
- **Only creating audio track if source has audio** (the fix)
- Writing encoded chunks to FileSystem API via mp4-muxer
- Progress reporting with separate loading and encoding progress
- Reporting progress as `{loading, encoding, overall}` percentages

**Key Feature**: Conditionally creates audio track based on `hasAudio` flag

## The Audio Track Fix

### Problem

When encoding a video file without audio:

1. Old code: Muxer created audio track because `config.audio` existed
2. Old code: No audio data was written (source had no audio)
3. Result: MP4 with empty audio track → VLC couldn't play it

### Solution

1. Demuxer detects if source has audio: `hasAudio = !!info.audioTracks?.[0]`
2. Calls `onReady(hasAudio)` before processing
3. Encoder only creates audio track if `hasAudio && config.audio`
4. Result: MP4 with correct tracks → VLC plays it perfectly

### Code Flow

```javascript
// demuxer.js
mp4boxfile.onReady = (info) => {
    const audioTrack = info.audioTracks?.[0];
    if (audioTrack && audioDecoder) {
        hasAudio = true;  // ← Source HAS audio
        // ... configure audio decoder
    }
    onReady(hasAudio);  // ← Tell encoder about audio availability
};

// encoder.js
const initializeEncoders = (hasAudio) => {
    const muxerConfig = { video: {...} };
    if (hasAudio && config.audio) {  // ← Check BOTH conditions
        muxerConfig.audio = {...};   // ← Only add if source has audio
    }
    muxer = new Muxer(muxerConfig);
};
```

## Usage Example

```javascript
import { encodeToFile } from './lib/core/encoder.js';

const config = {
    video: {
        codec: 'avc1.42001f',
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 30
    },
    audio: {  // This is REQUESTED audio config
        codec: 'mp4a.40.2',
        sampleRate: 44100,
        numberOfChannels: 2,
        bitrate: 128_000
    }
};

// Progress callback now receives separate loading and encoding percentages
await encodeToFile(file, config, (progress, stats) => {
    // progress = { loading: 0-100, encoding: 0-100, overall: 0-100 }
    console.log(`Loading: ${progress.loading}%, Encoding: ${progress.encoding}%, Overall: ${progress.overall}%`);
    if (stats) {
        console.log(`FPS: ${stats.fps}, Elapsed: ${stats.elapsedMs}ms`);
    }
});

// If source has audio: Output will have video + audio
// If source has NO audio: Output will have video only (no empty audio track)
```

## Testing

See `video-encoder-app/AUDIO_TRACK_FIX.md` for detailed testing instructions.

Quick test:

1. Encode a video with audio → Output should have both tracks
2. Encode a video without audio → Output should have only video track
3. Both outputs should play correctly in VLC without warnings
