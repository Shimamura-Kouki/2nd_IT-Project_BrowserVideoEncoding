/**
 * Audio codec utilities for bitrate validation and normalization
 */

/**
 * Valid AAC bitrate values in bps (used by both AAC-LC and AAC-HE)
 */
const AAC_VALID_VALUES = [96000, 128000, 160000, 192000];

/**
 * Rounds bitrate to the nearest valid AAC value
 * @param {number} bitrate - Input bitrate in bps
 * @returns {number} - Nearest valid AAC bitrate
 */
export function roundToValidAACBitrate(bitrate) {
    return AAC_VALID_VALUES.reduce((prev, curr) => 
        Math.abs(curr - bitrate) < Math.abs(prev - bitrate) ? curr : prev
    );
}

/**
 * Rounds bitrate to the nearest valid AAC-LC value
 * @param {number} bitrate - Input bitrate in bps
 * @returns {number} - Nearest valid AAC-LC bitrate
 * @deprecated Use roundToValidAACBitrate instead
 */
export function roundToValidAACLCBitrate(bitrate) {
    return roundToValidAACBitrate(bitrate);
}

/**
 * Validates and normalizes audio bitrate based on codec
 * @param {string} codec - Audio codec string (e.g., 'mp4a.40.2', 'mp4a.40.5', 'opus')
 * @param {number} bitrate - Input bitrate in bps
 * @returns {number} - Validated and normalized bitrate
 */
export function validateAudioBitrate(codec, bitrate) {
    if (codec.startsWith('mp4a.40.2') || codec.startsWith('mp4a.40.5')) {
        // AAC-LC and AAC-HE: Must be one of the valid values
        return roundToValidAACBitrate(bitrate);
    }
    // For other codecs, return as-is
    return bitrate;
}
