import MP4Box from 'mp4box';
import { CONTAINER_OVERHEAD_PERCENTAGE, MINIMUM_VIDEO_BITRATE } from '../constants.js';

// Progress contribution: demuxing contributes 10% of total progress, encoding 90%
const DEMUX_PROGRESS_PERCENTAGE = 10;

/**
 * 入力MP4を解析し、WebCodecsのデコーダへ供給する
 * @param {File} file
 * @param {VideoDecoder} videoDecoder
 * @param {AudioDecoder|null} audioDecoder
 * @param {(detectedFormat: {hasAudio: boolean, audioFormat?: {sampleRate: number, numberOfChannels: number, bitrate: number|null}, videoFormat?: {width: number, height: number, codec: string, framerate: number|null, bitrate: number|null}, totalFrames: number})=>void} onReady - Called when metadata is ready with detected format info
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
        let totalFrames = 0;
        // Guard flag to prevent multiple onReady callbacks
        // MP4Box.js may fire onReady multiple times when:
        // - File metadata is fragmented across multiple chunks
        // - Progressive loading triggers re-parsing of file structure
        // - Corrupt or non-standard MP4 files are being processed
        let readyCallbackFired = false;

        mp4boxfile.onReady = (info) => {
            // Guard against multiple onReady events
            if (readyCallbackFired) {
                console.warn('mp4boxfile.onReady fired multiple times - ignoring subsequent call');
                return;
            }
            readyCallbackFired = true;
            
            const videoTrack = info.videoTracks?.[0];
            const audioTrack = info.audioTracks?.[0];
            let detectedVideoFormat = null;
            
            // First, determine audio bitrate to use in video bitrate calculation
            let audioBitrate = null;
            if (audioTrack && audioDecoder) {
                hasAudio = true;
                audioTrackId = audioTrack.id;
                
                // Calculate audio bitrate
                if (audioTrack.bitrate) {
                    audioBitrate = audioTrack.bitrate;
                } else {
                    // Rough estimate for common audio formats when bitrate is not available
                    audioBitrate = 128000; // default estimate
                }
                
                detectedAudioFormat = {
                    sampleRate: audioTrack.audio.sample_rate,
                    numberOfChannels: audioTrack.audio.channel_count,
                    bitrate: audioBitrate
                };
                
                // Get audio description for codecs that need it (e.g., AAC)
                const audioEntry = mp4boxfile.getTrackById(audioTrackId).mdia.minf.stbl.stsd.entries[0];
                const audioDescription = generateAudioDescriptionBuffer(audioEntry);
                
                const audioConfig = {
                    codec: audioTrack.codec,
                    sampleRate: audioTrack.audio.sample_rate,
                    numberOfChannels: audioTrack.audio.channel_count
                };
                
                // Add description if available (required for AAC and some other codecs)
                if (audioDescription) {
                    audioConfig.description = audioDescription;
                }
                
                console.log(`Configuring AudioDecoder: codec=${audioConfig.codec}, sampleRate=${audioConfig.sampleRate}, channels=${audioConfig.numberOfChannels}, hasDescription=${!!audioDescription}`);
                audioDecoder.configure(audioConfig);
                console.log('AudioDecoder configured successfully');
                mp4boxfile.setExtractionOptions(audioTrackId, 'audio', { nbSamples: 100 });
            }
            
            if (videoTrack) {
                videoTrackId = videoTrack.id;
                // Calculate total frames from track info
                totalFrames = videoTrack.nb_samples ?? 0;
                
                // Calculate video bitrate from track info
                let videoBitrate = null;
                if (videoTrack.bitrate) {
                    videoBitrate = videoTrack.bitrate;
                } else if (videoTrack.movie_duration && info.size) {
                    // Estimate from file size and duration
                    const durationSec = videoTrack.movie_duration / videoTrack.movie_timescale;
                    const totalBitrate = Math.round((info.size * 8) / durationSec);
                    // Subtract audio bitrate and estimated container overhead
                    const containerOverhead = totalBitrate * CONTAINER_OVERHEAD_PERCENTAGE;
                    const estimatedAudioBitrate = audioBitrate || 0;
                    videoBitrate = Math.round(totalBitrate - estimatedAudioBitrate - containerOverhead);
                    // Ensure video bitrate is at least positive
                    if (videoBitrate < MINIMUM_VIDEO_BITRATE) {
                        videoBitrate = MINIMUM_VIDEO_BITRATE;
                    }
                }
                
                detectedVideoFormat = {
                    width: videoTrack.video.width,
                    height: videoTrack.video.height,
                    codec: videoTrack.codec,
                    framerate: videoTrack.movie_duration && videoTrack.nb_samples 
                        ? (videoTrack.nb_samples * videoTrack.movie_timescale / videoTrack.movie_duration)
                        : null,
                    bitrate: videoBitrate
                };
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

            // Call the onReady callback to initialize encoders and muxer with detected format
            onReady({
                hasAudio,
                audioFormat: detectedAudioFormat,
                videoFormat: detectedVideoFormat,
                totalFrames
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
        // Demuxing should contribute only a portion of total progress
        // The remaining will be for encoding
        const demuxProgress = Math.min(DEMUX_PROGRESS_PERCENTAGE, (offset / file.size) * DEMUX_PROGRESS_PERCENTAGE);
        onProgress(demuxProgress);
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

function generateAudioDescriptionBuffer(entry) {
    // For AAC audio, we need the AudioSpecificConfig from the esds box
    if (entry.esds) {
        const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
        entry.esds.write(stream);
        // The esds box structure has the AudioSpecificConfig
        // We need to extract it from the Elementary Stream Descriptor
        // The exact offset may vary, so we'll return the full esds data
        // and let the decoder parse it
        return new Uint8Array(stream.buffer.slice(8));
    }
    return null;
}