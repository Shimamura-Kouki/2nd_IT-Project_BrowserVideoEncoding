/**
 * Shared constants for video encoding
 */

// Bitrate calculation constants
// Container overhead varies by format: MP4 ~1-3%, WebM ~1-2%
// Using 2% as a conservative average estimate across formats
export const CONTAINER_OVERHEAD_PERCENTAGE = 0.02;
export const MINIMUM_VIDEO_BITRATE = 100000; // 100 Kbps minimum to ensure playable video

// Keyframe interval for video encoding (in seconds)
// Controls frequency of I-frames/keyframes for seeking performance
// 2 seconds provides good balance between file size and seek responsiveness
// For WebM, this also affects cluster boundaries when streaming: false
export const KEYFRAME_INTERVAL_SECONDS = 2;
