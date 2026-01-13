# Video Metadata Export and Comparison Tools

## Overview
This directory contains utilities to export and compare video metadata in XML format. These tools help validate the video encoding process by comparing source and output file metadata.

## Prerequisites
- `mediainfo` must be installed on your system
- For Debian/Ubuntu: `sudo apt-get install mediainfo`
- For macOS: `brew install mediainfo`
- For Windows: Download from https://mediaarea.net/en/MediaInfo

## Tools

### 1. export-metadata.sh
Exports video file metadata to XML format.

#### Usage
```bash
./export-metadata.sh <input-video-file> [output-xml-file]
```

#### Examples
```bash
# Export metadata with automatic XML filename
./export-metadata.sh input.mp4
# Creates: input.xml

# Works with other video formats too
./export-metadata.sh video.mov
# Creates: video.xml

./export-metadata.sh recording.webm
# Creates: recording.xml

# Export metadata with custom XML filename
./export-metadata.sh 画面録画.mp4 source-metadata.xml
# Creates: source-metadata.xml
```

#### Output
The script generates an XML file containing comprehensive metadata including:
- General information (file format, duration, file size)
- Video track information (codec, resolution, bitrate, frame rate)
- Audio track information (codec, sample rate, channels, bitrate)

### 2. compare-metadata.sh
Compares metadata between source and output video files, helping validate the encoding process.

#### Usage
```bash
./compare-metadata.sh <source-video> <output-video>
```

#### Examples
```bash
# Compare original recording with encoded output
./compare-metadata.sh 画面録画.mp4 output.mp4

# Works with other video formats too
./compare-metadata.sh source.mov output.mp4
./compare-metadata.sh recording.webm encoded.mp4
```

#### Output
The script:
1. Exports metadata for both files as XML
2. Displays full metadata for both files
3. Compares audio track counts
4. Provides validation results:
   - ✓ PASS: Both files have no audio (video-only encoding)
   - ✓ PASS: Both files have audio tracks
   - ✗ FAIL: Output has audio but source doesn't (empty audio track bug)
   - ⚠ WARNING: Source has audio but output doesn't

## Use Cases

### Validating the Audio Track Fix
The audio track fix (documented in AUDIO_TRACK_FIX.md) ensures that the encoder only creates audio tracks when the source video contains audio. Use the comparison tool to validate this:

```bash
# Test with video-only source (no audio)
./compare-metadata.sh video-only-source.mp4 output.mp4
# Expected: Both files should have 0 audio tracks

# Test with video+audio source
./compare-metadata.sh video-with-audio.mp4 output.mp4
# Expected: Both files should have 1 audio track
```

### Debugging Encoding Issues
If you encounter playback issues with encoded videos:

1. Export metadata for both files:
   ```bash
   ./export-metadata.sh source.mp4 source.xml
   ./export-metadata.sh output.mp4 output.xml
   ```

2. Compare the XML files to identify differences in:
   - Codec configurations
   - Track structure
   - Timing information
   - Sample counts

3. Look for warnings in VLC or other players about:
   - Missing audio tracks
   - Empty tracks (0 chunks, 0 STTS entries)
   - Track selection failures

### Understanding Encoding Changes
Compare source and output metadata to understand what changes during encoding:

```bash
./compare-metadata.sh original.mp4 encoded.mp4
```

Review differences in:
- File size (compression ratio)
- Video bitrate
- Audio bitrate (if present)
- Resolution (if rescaled)
- Frame rate

## XML Structure
The exported XML files follow the MediaInfo XML schema and contain tracks like:

```xml
<MediaInfo>
  <media>
    <track type="General">
      <Format>MPEG-4</Format>
      <FileSize>12345678</FileSize>
      <Duration>60.000</Duration>
      <AudioCount>1</AudioCount>
      <VideoCount>1</VideoCount>
    </track>
    <track type="Video">
      <Format>AVC</Format>
      <Width>1920</Width>
      <Height>1080</Height>
      <FrameRate>30.000</FrameRate>
    </track>
    <track type="Audio">
      <Format>AAC</Format>
      <SamplingRate>48000</SamplingRate>
      <Channels>2</Channels>
    </track>
  </media>
</MediaInfo>
```

## Troubleshooting

### "mediainfo: command not found"
Install mediainfo using your system's package manager (see Prerequisites above).

### Permission denied
Make the scripts executable:
```bash
chmod +x export-metadata.sh compare-metadata.sh
```

### Windows usage
For Windows users, you can use Git Bash or WSL to run these scripts, or use mediainfo directly:
```cmd
mediainfo --Output=XML input.mp4 > metadata.xml
```

## Integration with Encoding Workflow

1. **Before encoding**: Export source metadata
   ```bash
   ./export-metadata.sh 画面録画.mp4
   ```

2. **Encode the video**: Use the web application to encode

3. **After encoding**: Compare metadata
   ```bash
   ./compare-metadata.sh 画面録画.mp4 output.mp4
   ```

4. **Validate**: Check that audio track behavior is correct based on source file

## Related Documentation
- [AUDIO_TRACK_FIX.md](AUDIO_TRACK_FIX.md) - Audio track fix implementation details
- [FIX_SUMMARY.md](../FIX_SUMMARY.md) - Overall fix summary for MP4 playback issues
