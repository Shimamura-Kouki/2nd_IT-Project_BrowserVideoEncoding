/**
 * WebM/Matroska demuxer placeholder
 * Currently not implemented - provides helpful error message
 * @param {File} file
 * @param {VideoDecoder} videoDecoder
 * @param {AudioDecoder|null} audioDecoder
 * @param {Function} onReady
 * @param {Function} onProgress
 * @returns {Promise<{hasAudio: boolean}>}
 */
export async function demuxWebM(file, videoDecoder, audioDecoder, onReady, onProgress) {
    return Promise.reject(new Error(
        'WebM形式のファイルは現在サポートされていません。\n\n' +
        'WebM input is not yet supported.\n\n' +
        'サポートされている形式:\n' +
        '- MP4 (.mp4)\n' +
        '- MOV (.mov)\n' +
        '- M4V (.m4v)\n\n' +
        'WebM形式のサポートは将来のバージョンで追加予定です。'
    ));
}

