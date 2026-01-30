/**
 * Shared constants for video encoding
 */

// Bitrate calculation constants
// Container overhead varies by format: MP4 ~1-3%, WebM ~1-2%
// Using 2% as a conservative average estimate across formats
export const CONTAINER_OVERHEAD_PERCENTAGE = 0.02;
export const MINIMUM_VIDEO_BITRATE = 100000; // 100 Kbps minimum to ensure playable video
