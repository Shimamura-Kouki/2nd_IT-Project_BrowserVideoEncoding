import { Muxer, FileSystemWritableFileStreamTarget } from 'mp4-muxer';
import { demuxAndDecode } from './demuxer.js';

// Progress contribution: demuxing contributes 10% of total progress, encoding 90%
const DEMUX_PROGRESS_PERCENTAGE = 10;
const ENCODING_PROGRESS_PERCENTAGE = 100 - DEMUX_PROGRESS_PERCENTAGE;

/**
 * ブラウザ内でエンコードし、FileSystem APIへストリーム保存
 * @param {File} file
 * @param {{ video: { width:number, height:number, bitrate:number, framerate:number, codec:string }, audio?: { sampleRate:number, numberOfChannels:number, bitrate:number, codec:string } }} config
 * @param {(pct:number, stats?:{fps:number, elapsedMs:number, etaMs?:number})=>void} onProgress
 * @returns {Promise<void>}
 */
export async function encodeToFile(file, config, onProgress) {
    const handle = await window.showSaveFilePicker({
        suggestedName: 'output.mp4',
        types: [{ description: 'Video File', accept: { 'video/mp4': ['.mp4'] } }]
    });
    const fileStream = await handle.createWritable();

    let muxer = null;
    let videoEncoder = null;
    let audioEncoder = null;
    let frameCount = 0;
    let totalFrames = 0; // Total frames to encode
    const start = performance.now();
    
    // Timeout delay to ensure all encoder output callbacks complete before finalization
    const COMPLETION_CHECK_DELAY_MS = 100;
    
    // Track pending chunks to ensure all are written before finalization
    // This prevents the race condition where muxer.finalize() is called
    // while encoder output callbacks are still adding chunks
    let pendingVideoChunks = 0;
    let pendingAudioChunks = 0;
    let encodingComplete = false;
    let resolveAllChunksWritten;
    const allChunksWrittenPromise = new Promise(resolve => {
        resolveAllChunksWritten = resolve;
    });
    let completionCheckTimeout = null;

    /**
     * Check if all chunks have been written to the muxer
     * Resolves the allChunksWrittenPromise when:
     * - Encoding is marked complete (after encoder flush)
     * - No pending video chunks
     * - No pending audio chunks
     * - A brief delay has passed to ensure no more chunks are coming
     */
    const checkIfComplete = () => {
        if (encodingComplete && pendingVideoChunks === 0 && pendingAudioChunks === 0) {
            // Clear any existing timeout
            if (completionCheckTimeout) {
                clearTimeout(completionCheckTimeout);
            }
            // Wait a brief moment to ensure no more chunks are coming from the encoder
            completionCheckTimeout = setTimeout(() => {
                // Double-check the counters after the delay
                if (pendingVideoChunks === 0 && pendingAudioChunks === 0) {
                    resolveAllChunksWritten();
                }
            }, COMPLETION_CHECK_DELAY_MS);
        }
    };

    // Callback to initialize muxer and encoders once we know the detected format
    const initializeEncoders = (detectedFormat) => {
        const { hasAudio, audioFormat, totalFrames: frames } = detectedFormat;
        totalFrames = frames ?? 0; // Store total frames for progress calculation
        
        // Create muxer with appropriate configuration
        const muxerConfig = {
            target: new FileSystemWritableFileStreamTarget(fileStream),
            video: { codec: 'avc', width: config.video.width, height: config.video.height },
            fastStart: false,
            firstTimestampBehavior: 'offset'
        };

        // Only add audio track if source has audio AND config includes audio
        // Use detected audio format from source file, not preset
        if (hasAudio && config.audio && audioFormat) {
            muxerConfig.audio = {
                codec: 'aac',
                sampleRate: audioFormat.sampleRate,
                numberOfChannels: audioFormat.numberOfChannels
            };
        }

        muxer = new Muxer(muxerConfig);

        videoEncoder = new VideoEncoder({
            output: (chunk, meta) => {
                pendingVideoChunks++;
                try {
                    muxer.addVideoChunk(chunk, meta);
                } finally {
                    pendingVideoChunks--;
                    checkIfComplete();
                }
            },
            error: (e) => console.error('VideoEncoder error', e)
        });

        videoEncoder.configure({
            codec: config.video.codec ?? 'avc1.640028',
            width: config.video.width,
            height: config.video.height,
            bitrate: config.video.bitrate,
            framerate: config.video.framerate,
            latencyMode: 'quality'
        });

        if (hasAudio && config.audio && audioFormat) {
            audioEncoder = new AudioEncoder({
                output: (chunk, meta) => {
                    pendingAudioChunks++;
                    try {
                        muxer.addAudioChunk(chunk, meta);
                    } finally {
                        pendingAudioChunks--;
                        checkIfComplete();
                    }
                },
                error: (e) => console.error('AudioEncoder error', e)
            });

            // Configure AudioEncoder with detected format from source file
            // This ensures compatibility with decoded audio data
            audioEncoder.configure({
                codec: config.audio.codec ?? 'mp4a.40.2',
                sampleRate: audioFormat.sampleRate,
                numberOfChannels: audioFormat.numberOfChannels,
                bitrate: config.audio.bitrate
            });
        }
    };

    const videoDecoder = new VideoDecoder({
        output: (frame) => {
            frameCount++;
            if (videoEncoder && videoEncoder.state === 'configured') {
                try {
                    videoEncoder.encode(frame);
                } catch (e) {
                    console.error('VideoEncoder encode error:', e);
                }
            }
            frame.close();
            const elapsedMs = performance.now() - start;
            const fps = frameCount / (elapsedMs / 1000);
            
            // Calculate progress: DEMUX_PROGRESS_PERCENTAGE for demuxing (already done) + remaining for encoding
            // Encoding progress is based on frames processed vs total frames
            let encodingProgress = DEMUX_PROGRESS_PERCENTAGE; // Start at demuxing complete
            if (totalFrames > 0) {
                encodingProgress = DEMUX_PROGRESS_PERCENTAGE + (frameCount / totalFrames) * ENCODING_PROGRESS_PERCENTAGE;
            }
            
            // Calculate estimated time to completion (ETA)
            let etaMs = 0;
            if (totalFrames > 0 && frameCount > 0 && frameCount < totalFrames) {
                const progressRatio = frameCount / totalFrames;
                const estimatedTotalMs = elapsedMs / progressRatio;
                etaMs = estimatedTotalMs - elapsedMs;
            }
            
            onProgress(encodingProgress, { fps, elapsedMs, etaMs });
        },
        error: (e) => console.error('VideoDecoder error', e)
    });

    const audioDecoder = new AudioDecoder({
        output: (audioData) => {
            if (audioEncoder && audioEncoder.state === 'configured') {
                try {
                    audioEncoder.encode(audioData);
                } catch (e) {
                    console.error('AudioEncoder encode error:', e);
                }
            }
            audioData.close();
        },
        error: (e) => console.error('AudioDecoder error', e)
    });

    const demuxResult = await demuxAndDecode(file, videoDecoder, audioDecoder, initializeEncoders, (pct) => onProgress(pct));

    // Flush encoders and wait for all output callbacks to complete
    try {
        await videoEncoder.flush();
    } catch (e) {
        console.error('VideoEncoder flush error:', e);
    }
    
    if (audioEncoder) {
        try {
            await audioEncoder.flush();
        } catch (e) {
            console.error('AudioEncoder flush error:', e);
        }
    }
    
    // Mark encoding as complete and check if we can finalize
    encodingComplete = true;
    checkIfComplete();
    
    // Wait for all pending chunks to be written to muxer
    await allChunksWrittenPromise;
    
    // Set progress to 100% when encoding is complete
    onProgress(100);
    
    // Now safe to finalize - all chunks have been written
    muxer.finalize();
    await fileStream.close();
}