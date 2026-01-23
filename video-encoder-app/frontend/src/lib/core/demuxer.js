import MP4Box from 'mp4box';

/**
 * 入力MP4を解析し、WebCodecsのデコーダへ供給する
 * @param {File} file
 * @param {VideoDecoder} videoDecoder
 * @param {AudioDecoder|null} audioDecoder
 * @param {(detectedFormat: {hasAudio: boolean, audioFormat?: {sampleRate: number, numberOfChannels: number}})=>void} onReady - Called when metadata is ready with detected format info
 * @param {(pct:number)=>void} onProgress
 * @returns {Promise<{hasAudio: boolean}>}
 */
export async function demuxAndDecode(file, videoDecoder, audioDecoder, onReady, onProgress) {
    return new Promise((resolve, reject) => {
        const mp4boxfile = MP4Box.createFile();
        let videoTrackId = null;
        let audioTrackId = null;
        let hasAudio = false;
        let detectedAudioFormat = null;

        mp4boxfile.onReady = (info) => {
            const videoTrack = info.videoTracks?.[0];
            if (videoTrack) {
                videoTrackId = videoTrack.id;
                const entry = mp4boxfile.getTrackById(videoTrackId).mdia.minf.stbl.stsd.entries[0];
                const description = generateDescriptionBuffer(entry);
                videoDecoder.configure({
                    codec: videoTrack.codec,
                    codedWidth: videoTrack.video.width,
                    codedHeight: videoTrack.video.height,
                    description
                });
                mp4boxfile.setExtractionOptions(videoTrackId, 'video', { nbSamples: 100 });
            }

            const audioTrack = info.audioTracks?.[0];
            if (audioTrack && audioDecoder) {
                hasAudio = true;
                audioTrackId = audioTrack.id;
                detectedAudioFormat = {
                    sampleRate: audioTrack.audio.sample_rate,
                    numberOfChannels: audioTrack.audio.channel_count
                };
                audioDecoder.configure({
                    codec: audioTrack.codec,
                    sampleRate: audioTrack.audio.sample_rate,
                    numberOfChannels: audioTrack.audio.channel_count
                });
                mp4boxfile.setExtractionOptions(audioTrackId, 'audio', { nbSamples: 100 });
            }

            // Call the onReady callback to initialize encoders and muxer with detected format
            onReady({
                hasAudio,
                audioFormat: detectedAudioFormat
            });

            mp4boxfile.start();
        };

    mp4boxfile.onSamples = (track_id, _user, samples) => {
        if (track_id === videoTrackId) {
            for (const sample of samples) {
                const chunk = new EncodedVideoChunk({
                    type: sample.is_sync ? 'key' : 'delta',
                    timestamp: Math.round(1e6 * sample.cts / sample.timescale),
                    duration: Math.round(1e6 * sample.duration / sample.timescale),
                    data: sample.data
                });
                videoDecoder.decode(chunk);
            }
        } else if (track_id === audioTrackId) {
            for (const sample of samples) {
                const chunk = new EncodedAudioChunk({
                    type: 'key',
                    timestamp: Math.round(1e6 * sample.cts / sample.timescale),
                    duration: Math.round(1e6 * sample.duration / sample.timescale),
                    data: sample.data
                });
                audioDecoder.decode(chunk);
            }
        }
    };

    const chunkSize = 1024 * 1024 * 5;
    let offset = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
        const buffer = e.target.result;
        buffer.fileStart = offset;
        mp4boxfile.appendBuffer(buffer);
        offset += buffer.byteLength;
        onProgress(Math.min(100, (offset / file.size) * 100));
        if (offset < file.size) {
            readNextChunk();
        } else {
            mp4boxfile.flush();
            resolve({ hasAudio });
        }
    };

    reader.onerror = () => {
        reject(new Error('Failed to read file'));
    };

    function readNextChunk() {
        const blob = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(blob);
    }

    readNextChunk();
    });
}

function generateDescriptionBuffer(entry) {
    if (entry.avcC) {
        const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
        entry.avcC.write(stream);
        return new Uint8Array(stream.buffer.slice(8));
    } else if (entry.hvcC) {
        const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
        entry.hvcC.write(stream);
        return new Uint8Array(stream.buffer.slice(8));
    }
    return null;
}