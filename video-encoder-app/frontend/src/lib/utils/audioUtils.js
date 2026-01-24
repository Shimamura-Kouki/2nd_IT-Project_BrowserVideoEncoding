/**
 * Audio codec utilities for bitrate validation and normalization
 */

/**
 * Valid AAC-LC bitrate values in bps
 */
const AAC_LC_VALID_VALUES = [96000, 128000, 160000, 192000];

/**
 * Rounds bitrate to the nearest valid AAC-LC value
 * @param {number} bitrate - Input bitrate in bps
 * @returns {number} - Nearest valid AAC-LC bitrate
 */
export function roundToValidAACLCBitrate(bitrate) {
    return AAC_LC_VALID_VALUES.reduce((prev, curr) => 
        Math.abs(curr - bitrate) < Math.abs(prev - bitrate) ? curr : prev
    );
}

/**
 * Validates and normalizes audio bitrate based on codec
 * @param {string} codec - Audio codec string (e.g., 'mp4a.40.2', 'opus')
 * @param {number} bitrate - Input bitrate in bps
 * @returns {number} - Validated and normalized bitrate
 */
export function validateAudioBitrate(codec, bitrate) {
    if (codec.startsWith('mp4a.40.2')) {
        // AAC-LC: Must be one of the valid values
        return roundToValidAACLCBitrate(bitrate);
    }
    // For other codecs, return as-is
    return bitrate;
}
