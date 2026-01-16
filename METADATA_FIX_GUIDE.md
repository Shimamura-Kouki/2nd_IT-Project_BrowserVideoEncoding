# Video Metadata Fix - Testing and Verification Guide

## Problem Summary

The output MP4 files had incorrect metadata causing seeking/duration issues:
- **Duration**: Showed 0.02s instead of actual duration (~18s)
- **Framerate**: Incorrectly calculated as 59206.15 fps instead of ~60 fps
- **Seeking**: Failed with "error while seeking" in ffplay
- **Audio**: Format mismatch warnings causing audio to be skipped

## Root Cause

1. **Timestamp/Duration Unit Error**: The code was passing timestamps and durations in milliseconds to `addVideoChunkRaw()`, but the mp4-muxer API expects **microseconds**. This caused:
   - Duration to appear 1000x shorter: 17.99s → 0.018s ≈ 0.02s
   - Framerate to appear 1000x faster: 60 fps → 60000 fps

2. **Audio Format Mismatch**: The AudioDecoder was comparing decoded audio format against the preset configuration instead of the detected input format, causing audio data to be skipped when formats didn't match.

## Changes Made

### 1. Fixed Timestamp/Duration Units (encoder.js)
**Before:**
```javascript
// マイクロ秒 → ミリ秒に変換（mp4-muxer要件）
const finalTsMs = normalizedTsUs / 1000;
const durationMs = durUs / 1000;
muxer.addVideoChunkRaw(data, chunk.type, finalTsMs, durationMs, meta);
```

**After:**
```javascript
// addVideoChunkRaw() expects timestamp and duration in microseconds
muxer.addVideoChunkRaw(data, chunk.type, normalizedTsUs, durUs, meta);
```

### 2. Fixed Audio Format Validation (encoder.js)
**Before:**
```javascript
// Compared against config (preset settings)
if (audioData.sampleRate === config.audio.sampleRate &&
    audioData.numberOfChannels === config.audio.numberOfChannels) {
    audioEncoder.encode(audioData);
}
```

**After:**
```javascript
// Always encode - AudioEncoder is configured with detected format
// Only log warning if there's an unexpected mismatch
if (audioData.sampleRate !== detectedAudioFormat.sampleRate ||
    audioData.numberOfChannels !== detectedAudioFormat.numberOfChannels) {
    console.warn('Audio format mismatch detected...');
}
audioEncoder.encode(audioData);
```

## Testing Instructions

### Prerequisites
- Chromium-based browser (Chrome, Edge) with WebCodecs API support
- Node.js and npm installed

### Build the Application
```bash
cd video-encoder-app/frontend
npm install
npm run build
```

### Run the Development Server
```bash
npm run dev
```

Then open http://localhost:5173 in your browser.

### Test Procedure

#### 1. Encode a Video
1. Drag & drop or select an MP4 file (preferably with audio at 48000 Hz)
2. Select a preset
3. Click "エンコード開始" (Start Encoding)
4. Choose save location
5. Wait for encoding to complete

#### 2. Verify Metadata with ffprobe
After encoding, check the output file metadata:

```bash
ffprobe output.mp4
```

**Expected Output:**
```
Duration: 00:00:17.99, start: 0.000000, bitrate: XXXX kb/s
Stream #0:0: Video: h264, yuv420p, 1920x1080, 60 fps, 60 tbr, ...
Stream #0:1: Audio: aac, 48000 Hz, stereo, fltp, 128 kb/s
```

**Before Fix (Incorrect):**
```
Duration: 00:00:00.02, start: 0.000000, bitrate: XXXXX kb/s
Stream #0:0: Video: h264, yuv420p, 1920x1080, 59206.15 fps, ...
```

#### 3. Test Seeking Functionality

**Using ffplay:**
```bash
ffplay output.mp4
```
- Press arrow keys to seek forward/backward
- Should seek smoothly without errors
- Before fix: "error while seeking" message appeared

**Using VLC:**
1. Open output.mp4 in VLC
2. Use the seek bar to jump to different positions
3. Verify video plays correctly at all positions
4. Check Tools → Codec Information shows correct duration and framerate

#### 4. Verify Audio Encoding
Check that audio is properly encoded (no "Audio will be skipped" warnings in console):

1. Open browser DevTools Console while encoding
2. Look for audio-related messages
3. Should see: "AudioEncoder configured with detected format: {sampleRate: 48000, numberOfChannels: 2}"
4. Should NOT see: "Audio will be skipped. Please select a preset matching your input file."

### Validation Checklist

- [ ] Build completes without errors
- [ ] Application starts and loads correctly
- [ ] Video encoding completes successfully
- [ ] ffprobe shows correct duration (matches input video duration)
- [ ] ffprobe shows correct framerate (matches input video framerate, typically ~60 fps)
- [ ] ffplay can seek without errors
- [ ] VLC can play and seek the video
- [ ] Audio is present in output (if input had audio)
- [ ] No audio format mismatch warnings in console

## Technical Details

### mp4-muxer API Specification
From the mp4-muxer documentation:
```typescript
addVideoChunkRaw(
    data: Uint8Array,
    type: 'key' | 'delta',
    timestamp: number, // in microseconds
    duration: number, // in microseconds
    meta?: EncodedVideoChunkMetadata
): void;
```

### WebCodecs Timestamp Units
- WebCodecs `EncodedVideoChunk.timestamp`: **microseconds**
- WebCodecs `EncodedVideoChunk.duration`: **microseconds**
- mp4-muxer `addVideoChunkRaw()`: expects **microseconds**
- The fix: Pass timestamps directly without conversion

### Audio Configuration Flow
1. Demuxer detects audio format from input file → `detectedFormat.audio`
2. Muxer configured with detected format (line 253-254)
3. AudioEncoder configured with detected format (line 304-305)
4. AudioDecoder validates against detected format (not preset config)

## Security Scan Results
```
Analysis Result for 'javascript'. Found 0 alerts:
- **javascript**: No alerts found.
```

## Expected Performance
- Same encoding speed as before (no performance regression)
- Same output file size
- Correct metadata in output files
- Proper seeking functionality

## Known Limitations
- This is a browser-based encoder, requires Chromium with WebCodecs support
- FileSystem Access API requires HTTPS (except for localhost)
- Large files may take significant time to encode

## References
- mp4-muxer documentation: https://github.com/Vanilagy/mp4-muxer
- WebCodecs API: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- Issue details: See problem statement in PR description
