# Audio Track Fix - Testing Guide

## Problem Fixed
The encoder was creating empty audio tracks in the output MP4 file when the source video had no audio, resulting in files that couldn't be played in VLC and other media players.

## Root Cause
- The muxer was configured with an audio track whenever `config.audio` was provided
- If the source video had no audio track, no audio data was written to the muxer
- This resulted in an MP4 with an empty audio track (0 chunks, 0 STTS entries)
- VLC and other players couldn't handle this invalid audio track

## Solution
1. Modified `demuxer.js` to detect whether the source has an audio track
2. Added an `onReady` callback that reports audio availability before processing starts
3. Modified `encoder.js` to only create an audio track in the muxer if:
   - The source video has an audio track AND
   - Audio encoding is requested in the config

## Testing the Fix

### Preparation
1. Build the frontend:
   ```bash
   cd video-encoder-app/frontend
   npm install
   npm run build
   ```

2. Start the dev server:
   ```bash
   npm run dev
   ```

### Test Case 1: Video with Audio
1. Open the application in a browser (requires Chromium-based browser with WebCodecs support)
2. Select an MP4 file that contains both video and audio tracks
3. Click "エンコード開始" (Start Encoding)
4. Save the output file
5. Verify:
   - The output MP4 plays correctly in VLC
   - VLC shows both video and audio tracks
   - No warnings about "cannot select track" appear in VLC debug logs

### Test Case 2: Video without Audio (The Fix)
1. Open the application in a browser
2. Select an MP4 file that contains only video (no audio track)
3. Click "エンコード開始" (Start Encoding)
4. Save the output file
5. Verify:
   - The output MP4 plays correctly in VLC
   - VLC shows only the video track
   - No empty audio track is created
   - No warnings about "cannot select track" appear in VLC debug logs

### Expected Behavior
- **Before the fix**: Video-only source files produced MP4s with empty audio tracks that VLC couldn't play
- **After the fix**: Video-only source files produce MP4s with no audio track, which VLC plays correctly

## Technical Details

### Changes to demuxer.js
- Added `hasAudio` flag to track audio availability
- Changed function signature to accept `onReady` callback
- Only configure audio decoder if source has audio AND audioDecoder is provided
- Call `onReady(hasAudio)` before starting demuxing
- Return Promise with `hasAudio` information

### Changes to encoder.js
- Moved muxer and encoder initialization into `initializeEncoders` callback
- Only add audio configuration to muxer if `hasAudio && config.audio`
- Only create audio encoder if `hasAudio && config.audio`
- Audio decoder still checks `audioEncoder` before encoding

## Additional Fix: Build Configuration
- Updated `vite.config.ts` to set `build.target: 'esnext'`
- This enables support for top-level await in the build output
- Required for the dynamic imports used in the application
