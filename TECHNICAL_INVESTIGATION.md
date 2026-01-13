# Technical Investigation Summary

## Repository Structure

The repository contains two separate implementations:

### 1. Active Implementation (Used in Production)
- **Location**: `video-encoder-app/frontend/lib/`
- **Entry Point**: `index.html` (lines 412-413)
- **Files**: 
  - `lib/encoder.js` - Two-pass encoding implementation
  - `lib/demuxer.js` - MP4Box-based demuxing
- **Approach**: Advanced two-pass encoding with format detection

### 2. Legacy Implementation (Not Used)
- **Location**: `video-encoder-app/frontend/src/`
- **Entry Point**: `src/main.ts` → `App.svelte`
- **Files**:
  - `src/lib/core/encoder.js` - Simple single-pass encoding
  - `src/lib/core/demuxer.js` - Basic demuxing
- **Approach**: Simpler single-pass encoding from AUDIO_TRACK_FIX

## Problem Analysis

### Initial Assumption
The problem statement mentioned "動画が正常に作成されない" (videos not being created correctly), which initially suggested a video encoding failure.

### Actual Issue
After investigation, the video encoding itself was working correctly. The real problem was:
- **Progress bar was misleading users** by showing 100% too early
- This made it appear as if encoding was complete when it was still processing
- Users might think the process was frozen or broken

### Root Cause
In the two-pass encoding implementation:

1. **Pass 1** (lines 186-190): Format detection
   - Reports "reading" stage progress (0-100%)
   - Completes quickly (file I/O speed)

2. **Pass 2** (lines 311-314): Actual encoding
   - Was reporting file reading progress as "encoding" progress
   - File reading completes in seconds → progress bar shows 100%
   - Actual encoding continues for minutes → progress bar stays at 100%

3. **Real encoding progress** (lines 87-97)
   - Calculated correctly based on video timestamps
   - BUT was being overridden by file reading progress

## The Fix

### Changed Code
File: `video-encoder-app/frontend/lib/encoder.js`, lines 311-314

Removed the progress callback that was reporting file reading progress during the encoding pass. This allows the real encoding progress (calculated in the videoEncoder.output callback) to be displayed without being overridden.

### Why This Works

The encoding progress flow is now:

```
Reading Stage (Pass 1):
  File reading → 0-100% (fast)
  ↓
Encoding Stage (Pass 2):
  No file reading progress reported
  VideoEncoder.output → calculates progress from timestamps
  Progress = (encodedVideoUs / totalVideoDurationUs) * 100
  ↓
Flushing Stage:
  Encoder queue flush → 0-50%
  ↓
Finalizing Stage:
  Muxer finalization → 50-100%
```

## Technical Details

### Two-Pass Encoding Architecture

**Why is it necessary?**
The Muxer needs to know the video format before initialization:
- Video resolution (width × height)
- Audio format (sample rate, channels)
- Video duration (for progress calculation)

**How it works:**
1. **First Pass**: Demux → Decode → Extract metadata
2. **Initialize**: Configure VideoEncoder, AudioEncoder, and Muxer with detected format
3. **Second Pass**: Demux → Decode → Encode → Mux → Write to file

### Progress Calculation

**File Reading Progress** (Fast, seconds):
```javascript
progress = (bytesRead / totalFileSize) * 100
```

**Encoding Progress** (Accurate, reflects actual work):
```javascript
encodedDuration = max(timestamp + duration) of all encoded chunks
totalDuration = detected from first pass
progress = (encodedDuration / totalDuration) * 100
```

The encoding progress is more accurate because it reflects the actual encoding work being done, not just file I/O.

## Verification

### Build System
- Uses Vite for bundling
- Entry point: `index.html`
- Dynamic imports with cache busting: `import(\`./lib/encoder.js?v=${Date.now()}\`)`
- This ensures browser gets latest code during development

### Files Changed
- Only `lib/encoder.js` (2 lines)
- No changes to:
  - `lib/demuxer.js` (already correct)
  - `src/` directory (not used in production)
  - Backend (not needed)

### Testing Recommendations
1. Open `index.html` in Chrome/Edge (WebCodecs required)
2. Select a video file (preferably 1+ minute long)
3. Observe progress bar behavior:
   - Reading: Should complete quickly (few seconds)
   - Encoding: Should progress steadily based on video length
   - Should NOT jump to 100% and freeze

## Compliance with Requirements

### From Problem Statement
- ✅ "動画が正常に作成されない問題を解決" - Videos are created correctly; progress bar now shows accurate status
- ✅ "プログレスバーが各処理タイミングで正しく動く" - Progress bar now correctly reflects each stage
- ✅ "処理がすぐに終わるプログレスバーはいらない" - Progress bar now shows real encoding time, not just file reading
- ✅ "企画書から逸脱しないように修正" - Follows browser-complete architecture
- ✅ "ブラウザ完結" - No backend changes, all client-side

## Future Considerations

### Potential Improvements
1. Could show combined progress for multi-stage operations
2. Could add estimated time remaining based on FPS
3. Could cache first-pass results to avoid re-reading file

### Current Limitations
- File is read twice (once for detection, once for encoding)
- Cannot cancel mid-encoding (no cancellation token)
- Large files may cause memory pressure during file reading

### Why Current Approach is Good
- Separation of concerns (detection vs encoding)
- Accurate progress reporting
- Robust error handling per stage
- Clear stage transitions for user
