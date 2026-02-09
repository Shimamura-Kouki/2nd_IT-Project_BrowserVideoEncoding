import MP4Box from 'mp4box';
import { CONTAINER_OVERHEAD_PERCENTAGE, MINIMUM_VIDEO_BITRATE, MAX_MP4BOX_PARSING_ERRORS } from '../constants.js';
import { demuxWebM } from './webm-demuxer.js';

/**
 * ファイルタイプを検出 (拡張子ベース)
 * @param {File} file
 * @returns {string} 'mp4', 'mov', 'webm', or 'unknown'
 */
function detectFileType(file) {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.webm')) return 'webm';
    if (fileName.endsWith('.mov')) return 'mov';
    if (fileName.endsWith('.mp4')) return 'mp4';
    if (fileName.endsWith('.m4v')) return 'mp4';
    
    // Check MIME type as fallback
    if (file.type === 'video/webm') return 'webm';
    if (file.type === 'video/quicktime') return 'mov';
    if (file.type === 'video/mp4') return 'mp4';
    
    return 'unknown';
}

/**
 * 入力動画ファイル (MP4/MOV/WebM) を解析し、WebCodecsのデコーダへ供給する
 * MP4とMOVはMP4Box.jsで解析 (ISOBMFF container)
 * WebMはwebm-demuxer.jsで処理 (現在は未実装で適切なエラーメッセージを表示)
 * @param {File} file
 * @param {VideoDecoder} videoDecoder
 * @param {AudioDecoder|null} audioDecoder
 * @param {(detectedFormat: {hasAudio: boolean, audioFormat?: {sampleRate: number, numberOfChannels: number, bitrate: number|null}, videoFormat?: {width: number, height: number, codec: string, framerate: number|null, bitrate: number|null}, totalFrames: number})=>void} onReady - Called when metadata is ready with detected format info
 * @param {(pct:number)=>void} onProgress
 * @returns {Promise<{hasAudio: boolean}>}
 * @throws {Error} When too many MP4Box parsing errors occur or file chunk processing fails
 */
export async function demuxAndDecode(file, videoDecoder, audioDecoder, onReady, onProgress) {
    // Detect file type
    const fileType = detectFileType(file);
    
    console.log(`━━━ File Loading Debug ━━━`);
    console.log(`File name: ${file.name}`);
    console.log(`File size: ${file.size} bytes (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`File type (MIME): ${file.type}`);
    console.log(`Detected container: ${fileType}`);
    
    // Route to appropriate demuxer
    if (fileType === 'webm') {
        console.log(`→ Routing to WebM demuxer (mkv-demuxer)`);
        return demuxWebM(file, videoDecoder, audioDecoder, onReady, onProgress);
    }
    
    // MP4, MOV, and unknown types use MP4Box
    // MP4Box.js supports ISOBMFF containers: MP4, MOV, M4V, 3GP, etc.
    console.log(`→ Routing to MP4Box demuxer (ISOBMFF container)`);
    return demuxMP4(file, videoDecoder, audioDecoder, onReady, onProgress);
}

/**
 * MP4/MOV demuxer using MP4Box.js
 * Supports all ISOBMFF container formats
 * @param {File} file
 * @param {VideoDecoder} videoDecoder
 * @param {AudioDecoder|null} audioDecoder
 * @param {Function} onReady
 * @param {Function} onProgress
 * @returns {Promise<{hasAudio: boolean}>}
 */
function demuxMP4(file, videoDecoder, audioDecoder, onReady, onProgress) {
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
        // Error tracking for MP4Box parsing
        let parsingErrorCount = 0;

        mp4boxfile.onReady = (info) => {
            // Guard against multiple onReady events
            if (readyCallbackFired) {
                console.warn('mp4boxfile.onReady fired multiple times - ignoring subsequent call');
                return;
            }
            readyCallbackFired = true;
            
            console.log(`MP4Box onReady - File metadata loaded`);
            console.log(`  Video tracks: ${info.videoTracks?.length || 0}`);
            console.log(`  Audio tracks: ${info.audioTracks?.length || 0}`);
            console.log(`  Duration: ${info.duration}ms (${(info.duration / 1000).toFixed(2)}s)`);
            console.log(`  Timescale: ${info.timescale}`);
            
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
                
                const audioConfig = {
                    codec: audioTrack.codec,
                    sampleRate: audioTrack.audio.sample_rate,
                    numberOfChannels: audioTrack.audio.channel_count
                };
                
                // Try to get audio description for codecs that might need it (e.g., AAC)
                // Note: This is optional and many AAC streams work fine without it
                try {
                    const audioEntry = mp4boxfile.getTrackById(audioTrackId).mdia.minf.stbl.stsd.entries[0];
                    const audioDescription = generateAudioDescriptionBuffer(audioEntry);
                    
                    if (audioDescription && audioDescription.length > 0) {
                        audioConfig.description = audioDescription;
                        console.log(`AudioDecoder using description buffer (${audioDescription.length} bytes)`);
                    }
                } catch (e) {
                    console.warn('Failed to extract audio description, proceeding without it:', e);
                }
                
                console.log(`Configuring AudioDecoder: codec=${audioConfig.codec}, sampleRate=${audioConfig.sampleRate}, channels=${audioConfig.numberOfChannels}`);
                audioDecoder.configure(audioConfig);
                console.log('AudioDecoder configured successfully');
                mp4boxfile.setExtractionOptions(audioTrackId, 'audio', { nbSamples: 100 });
            }
            
            if (videoTrack) {
                videoTrackId = videoTrack.id;
                // Calculate total frames from track info
                totalFrames = videoTrack.nb_samples ?? 0;
                
                console.log(`Video track detected:`);
                console.log(`  Codec: ${videoTrack.codec}`);
                console.log(`  Resolution: ${videoTrack.video.width}x${videoTrack.video.height}`);
                console.log(`  Total samples/frames: ${totalFrames}`);
                console.log(`  Track duration: ${videoTrack.movie_duration} (timescale: ${videoTrack.movie_timescale})`);
                
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
                
                const calculatedFramerate = videoTrack.movie_duration && videoTrack.nb_samples 
                    ? (videoTrack.nb_samples * videoTrack.movie_timescale / videoTrack.movie_duration)
                    : null;
                
                console.log(`  Calculated framerate: ${calculatedFramerate ? calculatedFramerate.toFixed(2) : 'unknown'} fps`);
                console.log(`  Video bitrate: ${videoBitrate ? (videoBitrate / 1000000).toFixed(2) + ' Mbps' : 'unknown'}`);
                
                detectedVideoFormat = {
                    width: videoTrack.video.width,
                    height: videoTrack.video.height,
                    codec: videoTrack.codec,
                    framerate: calculatedFramerate,
                    bitrate: videoBitrate
                };
                const entry = mp4boxfile.getTrackById(videoTrackId).mdia.minf.stbl.stsd.entries[0];
                const description = generateDescriptionBuffer(entry);
                
                console.log('Configuring VideoDecoder with:');
                console.log('  Codec:', videoTrack.codec);
                console.log('  Resolution:', videoTrack.video.width, 'x', videoTrack.video.height);
                console.log('  Description buffer:', description ? `${description.length} bytes` : 'null');
                
                const config = {
                    codec: videoTrack.codec,
                    codedWidth: videoTrack.video.width,
                    codedHeight: videoTrack.video.height
                };
                
                // Only add description if it exists (some codecs like VP8/VP9 may not need it)
                if (description) {
                    config.description = description;
                }
                
                videoDecoder.configure(config);
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

        // Add error handler for MP4Box parsing errors
        mp4boxfile.onError = (e) => {
            parsingErrorCount++;
            // Use console.warn for recoverable errors to avoid cluttering error logs
            console.warn(`MP4Box parsing warning (${parsingErrorCount}/${MAX_MP4BOX_PARSING_ERRORS}):`, e);
            
            // If we've exceeded the maximum number of parsing errors, reject the promise
            if (parsingErrorCount >= MAX_MP4BOX_PARSING_ERRORS) {
                const errorMsg = 'Too many MP4Box parsing errors. The file may be corrupted or in an unsupported format.';
                console.error(errorMsg);
                reject(new Error(errorMsg));
            }
            // Otherwise, continue processing - some errors are recoverable
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
        try {
            const buffer = e.target.result;
            buffer.fileStart = offset;
            mp4boxfile.appendBuffer(buffer);
            offset += buffer.byteLength;
            // Report demuxing progress as 0-100%
            const demuxProgress = Math.min(100, (offset / file.size) * 100);
            onProgress(demuxProgress);
            if (offset < file.size) {
                readNextChunk();
            } else {
                mp4boxfile.flush();
                resolve({ hasAudio });
            }
        } catch (error) {
            // Increment error counter for consistency with onError handler
            parsingErrorCount++;
            console.warn(`Warning processing file chunk (${parsingErrorCount}/${MAX_MP4BOX_PARSING_ERRORS}):`, error);
            
            // Use same error threshold as async errors for consistent behavior
            if (parsingErrorCount >= MAX_MP4BOX_PARSING_ERRORS) {
                console.error(`Failed to process file chunk: ${error.message}`);
                reject(new Error(`Failed to process file chunk: ${error.message}`));
            } else {
                // Try to continue with next chunk if we haven't exceeded threshold
                if (offset < file.size) {
                    readNextChunk();
                } else {
                    // If this was the last chunk, resolve anyway
                    resolve({ hasAudio });
                }
            }
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
        // H.264/AVC codec configuration
        const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
        entry.avcC.write(stream);
        const description = new Uint8Array(stream.buffer.slice(8));
        console.log('H.264 description extracted:', description.length, 'bytes');
        return description;
    } else if (entry.hvcC) {
        // H.265/HEVC codec configuration
        const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
        entry.hvcC.write(stream);
        const description = new Uint8Array(stream.buffer.slice(8));
        console.log('H.265 description extracted:', description.length, 'bytes');
        return description;
    } else if (entry.av1C) {
        // AV1 codec configuration
        const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
        entry.av1C.write(stream);
        const description = new Uint8Array(stream.buffer.slice(8));
        console.log('AV1 description extracted:', description.length, 'bytes');
        return description;
    } else if (entry.vpcC || entry.vp09) {
        // VP9 codec configuration
        // VP9 in MP4 uses vpcC box, but WebCodecs VideoDecoder for VP9
        // typically doesn't require a description buffer
        console.log('VP9 codec detected, no description buffer needed');
        return null;
    } else if (entry.type === 'vp08') {
        // VP8 codec - no description needed
        console.log('VP8 codec detected, no description buffer needed');
        return null;
    }
    
    console.warn('Unknown codec type in entry:', entry.type, '- no description buffer generated');
    return null;
}

function generateAudioDescriptionBuffer(entry) {
    // For AAC audio, we need the AudioSpecificConfig from the esds box
    if (entry.esds && entry.esds.esd) {
        // The AudioSpecificConfig is stored in the DecoderConfigDescriptor
        // which is part of the ES_Descriptor in the esds box
        const esd = entry.esds.esd;
        if (esd.decConfigDescr && esd.decConfigDescr.decSpecificInfo) {
            // This is the actual AudioSpecificConfig
            return esd.decConfigDescr.decSpecificInfo;
        }
    }
    return null;
}