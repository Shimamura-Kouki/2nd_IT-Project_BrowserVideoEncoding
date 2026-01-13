#!/bin/bash
# Video Metadata Export Utility
# This script exports video file metadata to XML format using mediainfo
# Usage: ./export-metadata.sh <input-video-file> [output-xml-file]

if [ $# -lt 1 ]; then
    echo "Usage: $0 <input-video-file> [output-xml-file]"
    echo "Example: $0 input.mp4"
    echo "Example: $0 input.mp4 metadata.xml"
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="${2:-${INPUT_FILE%.*}.xml}"

# Check if input file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found"
    exit 1
fi

# Check if mediainfo is available
if ! command -v mediainfo &> /dev/null; then
    echo "Error: mediainfo is not installed"
    echo "Please install it: sudo apt-get install mediainfo"
    exit 1
fi

# Export metadata to XML
echo "Exporting metadata from '$INPUT_FILE' to '$OUTPUT_FILE'..."
if ! mediainfo --Output=XML "$INPUT_FILE" > "$OUTPUT_FILE"; then
    echo "Error: Failed to export metadata"
    exit 1
fi

echo "Success! Metadata exported to: $OUTPUT_FILE"
echo ""
echo "Summary:"
SUMMARY_LINES=20
if ! mediainfo "$INPUT_FILE" | grep -E "^(General|Video|Audio)" | head -"${SUMMARY_LINES}"; then
    echo "Warning: Could not display summary"
fi
