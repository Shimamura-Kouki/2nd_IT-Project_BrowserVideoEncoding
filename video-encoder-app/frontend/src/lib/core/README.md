# Video Encoder Core Library

This directory contains the core encoding and demuxing logic for the browser-based video encoder application.

## Architecture

```txt
Input Video File (MP4/WebM)
      ↓
   demuxer.js ────────→ Detects tracks (video + audio?)
      ↓                         ↓
  Decoding                  onReady(hasAudio)
  (WebCodecs)                   ↓
      ↓                   encoder.js ← Initializes muxer based on hasAudio
  Raw Frames                    ↓
  (VideoFrame,             Creates appropriate tracks
   AudioData)                   ↓
      ↓                   Encoding (WebCodecs)
  Re-encoding                   ↓
  (VideoEncoder,          Encoded Chunks
   AudioEncoder)          (EncodedVideoChunk,
      ↓                   EncodedAudioChunk)
  QP/VBR/CBR                    ↓
  quality control         mp4-muxer or webm-muxer
      ↓                         ↓
  Muxed chunks           FileSystem API (output.mp4/webm)
      ↓                   or ArrayBuffer (Firefox fallback)
 Output file
```

### Progress Reporting

The encoding process is divided into two main phases with separate progress tracking:

- **Loading Phase (0-10% of overall)**: File reading and demuxing with MP4Box
  - Important on Android/mobile devices where file reading can take significant time
  - Reported separately as `progress.loading` (0-100%)
- **Encoding Phase (10-100% of overall)**: Video/audio encoding with WebCodecs
  - The main processing phase
  - Reported separately as `progress.encoding` (0-100%)
  - Includes sub-phases: encoding, flushing, finalizing

The UI displays three progress indicators:
1. **Loading Progress**: File reading and demuxing (0-100%)
2. **Encoding Progress**: Actual encoding (0-100%)
3. **Overall Progress**: Combined progress (0-100%)

Progress callback receives:
```javascript
{
  loading: 0-100,    // Loading phase progress
  encoding: 0-100,   // Encoding phase progress
  overall: 0-100     // Combined overall progress
}
```

## Files

### demuxer.js

Responsible for:

- Parsing input video files (MP4, WebM) using mp4box.js
- Extracting video and audio tracks from the container
- **Detecting whether source has audio** (critical for creating correct output)
- Feeding encoded samples to WebCodecs decoders
- Calling `onReady(hasAudio)` callback when metadata is available
- Tracking MP4Box parsing errors and reporting warnings
- Extracting video duration for progress calculation

**Key Features**: 
- Returns `hasAudio` flag to prevent creating empty audio tracks
- Error tolerance with configurable error threshold
- Supports seeking-incompatible video detection

### encoder.js

Responsible for:

- Setting up WebCodecs encoders (VideoEncoder, AudioEncoder) and decoders (VideoDecoder, AudioDecoder)
- **Supporting 3 bitrate modes**: Quantizer (QP), Variable (VBR), Constant (CBR)
- Configuring mp4-muxer or webm-muxer with appropriate tracks
- **Only creating audio track if source has audio** (prevents VLC playback issues)
- Writing encoded chunks to FileSystem API via muxer (or ArrayBuffer for Firefox)
- **2-pass encoding**: First pass to get duration, second pass for actual encoding
- Progress reporting with separate loading and encoding progress
- Reporting progress as `{loading, encoding, overall}` percentages
- FPS calculation and ETA estimation
- **Abort handling**: Proper cleanup on user cancellation

**Key Features**: 
- **QP (Quantization Parameter) mode support**: Constant quality encoding
  - H.264/H.265: QP range 0-51
  - VP9/AV1: QP range 0-63
- **Bitrate mode auto-adjustment**: VP8 doesn't support QP mode → auto-switch to VBR
- **Firefox fallback**: Uses ArrayBuffer + Blob download when FileSystem API unavailable
- **Audio bitrate validation**: Ensures AAC bitrates conform to spec (96/128/160/192 Kbps)
- **First frame keyframe enforcement**: Ensures first encoded frame is always a keyframe
- **Timestamp normalization**: Handles videos that don't start at timestamp 0

## Key Implementation Details

### Audio Track Handling

#### Problem
When encoding a video file without audio:
1. Old code: Muxer created audio track because `config.audio` existed
2. Old code: No audio data was written (source had no audio)
3. Result: MP4 with empty audio track → VLC couldn't play it

#### Solution
1. Demuxer detects if source has audio: `hasAudio = !!info.audioTracks?.[0]`
2. Calls `onReady(hasAudio)` before processing
3. Encoder only creates audio track if `hasAudio && config.audio`
4. Result: MP4 with correct tracks → VLC plays it perfectly

#### Code Flow
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

### QP (Quantization Parameter) Mode

QP mode provides constant quality encoding instead of constant bitrate:

```javascript
// Configuration
const config = {
    video: {
        codec: 'avc1.640028',
        width: 1920,
        height: 1080,
        bitrateMode: 'quantizer',  // Use QP mode
        quantizer: 28,              // QP value: 18 (high) to 38 (low)
        framerate: 30
    }
};
```

**Benefits:**
- Constant visual quality across all scenes
- Better quality for complex scenes (uses more bitrate automatically)
- Lower bitrate for simple scenes (saves file size)

**Codec-specific QP ranges:**
- H.264/H.265: 0-51 (recommended: 18-28)
- VP9/AV1: 0-63 (recommended: 20-35)
- VP8: QP mode NOT supported → auto-switch to VBR

**Important Note about QP Mode Bitrate:**
- In QP mode, the **output bitrate is determined by the encoder** based on:
  - The QP value (lower QP = higher quality = higher bitrate)
  - Content complexity (complex scenes use more bitrate)
  - Resolution and framerate
- The encoder does **NOT** accept a bitrate parameter in QP mode
- Example: VP9 at 480p with QP=38 may produce ~1800Kbps output
  - This is **expected behavior** and cannot be directly controlled
  - To reduce bitrate: increase QP value (e.g., QP=40-45)
  - To increase bitrate: decrease QP value (e.g., QP=30-35)
- For precise bitrate control, use VBR or CBR mode instead of QP mode

### 2-Pass Encoding

The encoder uses 2-pass encoding to accurately calculate progress:

1. **Pass 1 (Duration Detection)**: 
   - Quick demux to get video duration
   - No actual encoding
   - Used for accurate progress percentage

2. **Pass 2 (Actual Encoding)**:
   - Full decode → encode → mux pipeline
   - Progress tracked against known duration
   - Accurate ETA calculation

### Firefox Compatibility

FileSystem Access API is not supported in Firefox, so we use a fallback:

```javascript
// Firefox fallback (encoder.js)
if (!supportsFileSystemAccess) {
    // Use in-memory ArrayBuffer
    bufferTarget = new ArrayBufferTarget(container);
    // ... encode to buffer
    // ... then trigger download via Blob
    const blob = new Blob([buffer], { type: mimeType });
    // ... create download link
}
```

## Usage Example

```javascript
import { encodeToFile } from './lib/core/encoder.js';

// QP Mode (Recommended - Constant Quality)
const qpConfig = {
    video: {
        codec: 'avc1.640028',        // H.264 High Profile
        width: 1920,
        height: 1080,
        bitrateMode: 'quantizer',     // QP mode
        quantizer: 28,                 // QP value (18=high, 28=medium, 38=low)
        framerate: 30,
        container: 'mp4'
    },
    audio: {
        codec: 'mp4a.40.2',           // AAC-LC
        sampleRate: 44100,
        numberOfChannels: 2,
        bitrate: 128_000               // Must be 96/128/160/192 Kbps for AAC
    }
};

// VBR Mode (Traditional - Constant Bitrate Target)
const vbrConfig = {
    video: {
        codec: 'avc1.640028',
        width: 1920,
        height: 1080,
        bitrateMode: 'variable',      // VBR mode
        bitrate: 5_000_000,            // 5 Mbps target
        framerate: 30,
        container: 'mp4'
    },
    audio: {
        codec: 'mp4a.40.2',
        sampleRate: 44100,
        numberOfChannels: 2,
        bitrate: 128_000
    }
};

// WebM with VP9 and Opus
const webmConfig = {
    video: {
        codec: 'vp09.00.31.08',        // VP9 Profile 0
        width: 1920,
        height: 1080,
        bitrateMode: 'quantizer',
        quantizer: 28,
        framerate: 30,
        container: 'webm'
    },
    audio: {
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 128_000               // Opus supports any bitrate
    }
};

// Progress callback receives separate loading, encoding, and overall progress
const abortController = new AbortController();

await encodeToFile(file, qpConfig, (progress, stats) => {
    // progress = { loading: 0-100, encoding: 0-100, overall: 0-100 }
    console.log(`Loading: ${progress.loading}%`);
    console.log(`Encoding: ${progress.encoding}%`);
    console.log(`Overall: ${progress.overall}%`);
    
    if (stats) {
        console.log(`FPS: ${stats.fps}`);
        console.log(`Elapsed: ${stats.elapsedMs}ms`);
        console.log(`ETA: ${stats.etaMs}ms`);
    }
}, abortController.signal);

// To cancel encoding:
// abortController.abort();

// Output behavior:
// - If source has audio: Output will have video + audio tracks
// - If source has NO audio: Output will have video track only (no empty audio track)
// - Both outputs should play correctly in VLC and other players
```

## Testing

### Basic Functionality Tests

1. **Video with audio** → Output should have both tracks
2. **Video without audio** → Output should have only video track
3. **Both outputs** should play correctly in VLC without warnings

### QP Mode Tests

1. **QP mode with H.264** → Should encode with consistent quality
2. **QP mode with VP9/AV1** → Should encode with appropriate QP range
3. **QP mode with VP8** → Should auto-switch to VBR (VP8 doesn't support QP)

### Browser Compatibility Tests

1. **Chrome/Edge** → Full FileSystem API support, all features work
2. **Firefox** → Falls back to ArrayBuffer + Blob download
3. **Safari** → May have audio encoder issues (warning shown)

### Container Format Tests

1. **MP4 container** → H.264/H.265 + AAC
2. **WebM container** → VP8/VP9/AV1 + Opus
3. **Codec mismatch** → Auto-correct (e.g., VP9 in MP4 → switch to WebM)

### Edge Cases

1. **Video with non-zero start timestamp** → Should normalize to 0
2. **Video with seeking issues** → Should detect and warn
3. **Large files (>1GB)** → Should stream to disk without memory issues
4. **Abort during encoding** → Should cleanup properly

See the repository's implementation history (`video-encoder-app/実装履歴.md`) for detailed testing instructions and known issues.
