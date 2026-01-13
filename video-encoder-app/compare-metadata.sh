#!/bin/bash
# Video Metadata Comparison Utility
# This script compares metadata between source and output video files
# Usage: ./compare-metadata.sh <source-video> <output-video>

if [ $# -lt 2 ]; then
    echo "Usage: $0 <source-video> <output-video>"
    echo "Example: $0 画面録画.mp4 output.mp4"
    exit 1
fi

SOURCE_FILE="$1"
OUTPUT_FILE="$2"
SOURCE_XML="${SOURCE_FILE%.*}.xml"
OUTPUT_XML="${OUTPUT_FILE%.*}.xml"

# Check if input files exist
if [ ! -f "$SOURCE_FILE" ]; then
    echo "Error: Source file '$SOURCE_FILE' not found"
    exit 1
fi

if [ ! -f "$OUTPUT_FILE" ]; then
    echo "Error: Output file '$OUTPUT_FILE' not found"
    exit 1
fi

# Check if mediainfo is available
if ! command -v mediainfo &> /dev/null; then
    echo "Error: mediainfo is not installed"
    echo "Please install it: sudo apt-get install mediainfo"
    exit 1
fi

echo "=========================================="
echo "Video Metadata Comparison"
echo "=========================================="
echo ""

# Export metadata for both files
echo "Exporting metadata for source file..."
if ! mediainfo --Output=XML "$SOURCE_FILE" > "$SOURCE_XML"; then
    echo "Error: Failed to export metadata for source file"
    exit 1
fi
echo "Saved to: $SOURCE_XML"
echo ""

echo "Exporting metadata for output file..."
if ! mediainfo --Output=XML "$OUTPUT_FILE" > "$OUTPUT_XML"; then
    echo "Error: Failed to export metadata for output file"
    exit 1
fi
echo "Saved to: $OUTPUT_XML"
echo ""

echo "=========================================="
echo "Source File: $SOURCE_FILE"
echo "=========================================="
if ! mediainfo "$SOURCE_FILE"; then
    echo "Warning: Could not display source file metadata"
fi
echo ""

echo "=========================================="
echo "Output File: $OUTPUT_FILE"
echo "=========================================="
if ! mediainfo "$OUTPUT_FILE"; then
    echo "Warning: Could not display output file metadata"
fi
echo ""

echo "=========================================="
echo "Track Comparison"
echo "=========================================="
echo ""

# Check for audio tracks
SOURCE_AUDIO_COUNT=$(mediainfo --Inform="General;%AudioCount%" "$SOURCE_FILE" 2>/dev/null || echo "0")
OUTPUT_AUDIO_COUNT=$(mediainfo --Inform="General;%AudioCount%" "$OUTPUT_FILE" 2>/dev/null || echo "0")

# Ensure counts are valid numbers
SOURCE_AUDIO_COUNT="${SOURCE_AUDIO_COUNT:-0}"
OUTPUT_AUDIO_COUNT="${OUTPUT_AUDIO_COUNT:-0}"

echo "Source Audio Tracks: ${SOURCE_AUDIO_COUNT:-0}"
echo "Output Audio Tracks: ${OUTPUT_AUDIO_COUNT:-0}"
echo ""

if [ "$SOURCE_AUDIO_COUNT" = "0" ] && [ "$OUTPUT_AUDIO_COUNT" = "0" ]; then
    echo "✓ PASS: Both files have no audio track (video-only encoding worked correctly)"
elif [ "$SOURCE_AUDIO_COUNT" != "0" ] && [ "$OUTPUT_AUDIO_COUNT" != "0" ]; then
    echo "✓ PASS: Both files have audio tracks"
elif [ "$SOURCE_AUDIO_COUNT" = "0" ] && [ "$OUTPUT_AUDIO_COUNT" != "0" ]; then
    echo "✗ FAIL: Output has audio track but source doesn't (unexpected empty audio track)"
elif [ "$SOURCE_AUDIO_COUNT" != "0" ] && [ "$OUTPUT_AUDIO_COUNT" = "0" ]; then
    echo "⚠ WARNING: Source has audio but output doesn't (audio was not encoded)"
fi

echo ""
echo "XML files saved:"
echo "  Source: $SOURCE_XML"
echo "  Output: $OUTPUT_XML"
