import { Muxer as MP4Muxer, FileSystemWritableFileStreamTarget as MP4Target } from 'mp4-muxer';
import { Muxer as WebMMuxer, FileSystemWritableFileStreamTarget as WebMTarget } from 'webm-muxer';
import { demuxAndDecode } from './demuxer.js';
import { validateAudioBitrate, isAACCodec } from '../utils/audioUtils.js';

// Progress contribution: demuxing contributes 10% of total progress, encoding 90%
const DEMUX_PROGRESS_PERCENTAGE = 10;
const ENCODING_PROGRESS_PERCENTAGE = 100 - DEMUX_PROGRESS_PERCENTAGE;

/**
 * ブラウザ内でエンコードし、FileSystem APIへストリーム保存
 * @param {File} file
 * @param {{ video: { width:number, height:number, bitrate:number, framerate:number, framerateMode?:string, codec:string, container?:string }, audio?: { sampleRate:number, numberOfChannels:number, bitrate:number, codec:string } }} config
 * @param {(pct:number, stats?:{fps:number, elapsedMs:number, etaMs?:number})=>void} onProgress
 * @param {AbortSignal} [signal] - Optional AbortSignal to cancel encoding
 * @returns {Promise<void>}
 */
export async function encodeToFile(file, config, onProgress, signal) {
    // Determine container format from config or codec
    const container = config.video.container || (
        config.video.codec.startsWith('vp') || config.video.codec.startsWith('av01') ? 'webm' : 'mp4'
    );
    
    const fileExtension = container === 'webm' ? '.webm' : (container === 'mov' ? '.mov' : '.mp4');
    const mimeType = container === 'webm' ? 'video/webm' : 'video/mp4';
    
    // Generate output filename based on original file and bitrate
    const originalNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    const videoBitrateMbps = (config.video.bitrate / 1000000).toFixed(1);
    const suggestedName = `${originalNameWithoutExt}_${videoBitrateMbps}Mbps${fileExtension}`;
    
    const handle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [{ description: 'Video File', accept: { [mimeType]: [fileExtension] } }]
    });
    const fileStream = await handle.createWritable();

    let muxer = null;
    let videoEncoder = null;
    let audioEncoder = null;
    
    // Track abort status
    let aborted = false;
    
    // Cleanup function to handle cancellation
    const cleanup = async () => {
        aborted = true;
        try {
            // Close encoders - check both existence and state
            if (videoEncoder) {
                try {
                    if (videoEncoder.state === 'configured' || videoEncoder.state === 'unconfigured') {
                        videoEncoder.close();
                    }
                } catch (e) {
                    console.error('Error closing video encoder:', e);
                }
            }
            if (audioEncoder) {
                try {
                    if (audioEncoder.state === 'configured' || audioEncoder.state === 'unconfigured') {
                        audioEncoder.close();
                    }
                } catch (e) {
                    console.error('Error closing audio encoder:', e);
                }
            }
            // Close the file stream
            if (fileStream) {
                try {
                    await fileStream.abort();
                } catch (e) {
                    console.error('Error aborting file stream:', e);
                }
            }
        } catch (e) {
            console.error('Cleanup error:', e);
        }
    };
    
    // Set up abort listener if signal is provided
    if (signal) {
        signal.addEventListener('abort', cleanup, { once: true });
    }

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
    let muxerFinalized = false; // Flag to track if muxer has been finalized
    let resolveAllChunksWritten;
    const allChunksWrittenPromise = new Promise(resolve => {
        resolveAllChunksWritten = resolve;
    });
    let completionCheckTimeout = null;
    
    // Guard flag to prevent multiple initializations
    // This prevents the race condition where initializeEncoders is called multiple times
    // (e.g., if demuxer's onReady callback fires multiple times)
    // causing multiple muxer instances and encoder reconfigurations
    let encodersInitialized = false;

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
        // Guard against multiple initializations
        // If mp4boxfile.onReady fires multiple times, we should ignore subsequent calls
        if (encodersInitialized) {
            console.warn('initializeEncoders called multiple times - ignoring subsequent call');
            return;
        }
        encodersInitialized = true;
        
        const { hasAudio, audioFormat, videoFormat, totalFrames: frames } = detectedFormat;
        totalFrames = frames ?? 0; // Store total frames for progress calculation
        
        // Pass metadata to the progress callback
        onProgress(undefined, undefined, detectedFormat);
        
        // Determine output framerate
        let outputFramerate = config.video.framerate;
        if (config.video.framerateMode === 'original' && videoFormat?.framerate) {
            outputFramerate = videoFormat.framerate;
            console.log(`Using original framerate: ${outputFramerate.toFixed(2)} fps`);
        }
        
        // Calculate actual output dimensions to prevent upscaling
        let outputWidth = config.video.width;
        let outputHeight = config.video.height;
        
        if (videoFormat) {
            const originalWidth = videoFormat.width;
            const originalHeight = videoFormat.height;
            const originalAspectRatio = originalWidth / originalHeight;
            
            // If only width is specified (height is null/undefined), calculate height
            if (outputWidth && !outputHeight) {
                outputHeight = Math.round(outputWidth / originalAspectRatio);
            }
            // If only height is specified (width is null/undefined), calculate width
            else if (!outputWidth && outputHeight) {
                outputWidth = Math.round(outputHeight * originalAspectRatio);
            }
            // If both are specified, maintain aspect ratio by fitting to the smaller dimension
            else if (outputWidth && outputHeight) {
                const targetAspectRatio = outputWidth / outputHeight;
                if (Math.abs(targetAspectRatio - originalAspectRatio) > 0.01) {
                    // Aspect ratios don't match, fit to maintain original ratio
                    if (targetAspectRatio > originalAspectRatio) {
                        // Target is wider, constrain by height
                        outputWidth = Math.round(outputHeight * originalAspectRatio);
                    } else {
                        // Target is taller, constrain by width
                        outputHeight = Math.round(outputWidth / originalAspectRatio);
                    }
                }
            }
            // If neither width nor height is specified, use original dimensions
            else if (!outputWidth && !outputHeight) {
                outputWidth = originalWidth;
                outputHeight = originalHeight;
            }
            
            // Prevent upscaling: don't exceed original dimensions
            if (outputWidth > originalWidth || outputHeight > originalHeight) {
                const scale = Math.min(originalWidth / outputWidth, originalHeight / outputHeight);
                outputWidth = Math.round(outputWidth * scale);
                outputHeight = Math.round(outputHeight * scale);
            }
            
            // Ensure dimensions are even numbers (required for many codecs)
            outputWidth = Math.round(outputWidth / 2) * 2;
            outputHeight = Math.round(outputHeight / 2) * 2;
        }
        
        // Determine container format from config
        const container = config.video.container || (
            config.video.codec.startsWith('vp') || config.video.codec.startsWith('av01') ? 'webm' : 'mp4'
        );
        
        // Map WebCodecs codec strings to muxer codec identifiers
        const getMuxerCodec = (codecString, type) => {
            if (type === 'video') {
                if (codecString.startsWith('avc') || codecString.startsWith('h264')) return 'avc';
                if (codecString.startsWith('hev') || codecString.startsWith('hvc') || codecString.startsWith('h265')) return 'hevc';
                if (codecString.startsWith('vp09') || codecString.startsWith('vp9')) return 'V_VP9';
                if (codecString.startsWith('vp08') || codecString.startsWith('vp8')) return 'V_VP8';
                if (codecString.startsWith('av01')) return 'V_AV1';
                return 'avc'; // default fallback
            } else { // audio
                if (codecString.startsWith('mp4a') || codecString.toLowerCase().includes('aac')) return 'aac';
                if (codecString.toLowerCase() === 'opus') return 'A_OPUS';
                return 'aac'; // default fallback
            }
        };
        
        const videoMuxerCodec = getMuxerCodec(config.video.codec, 'video');
        const audioMuxerCodec = config.audio ? getMuxerCodec(config.audio.codec, 'audio') : null;
        
        // Create muxer with appropriate configuration based on container
        if (container === 'webm') {
            // WebM muxer configuration
            const muxerConfig = {
                target: new WebMTarget(fileStream),
                video: { 
                    codec: videoMuxerCodec,
                    width: outputWidth, 
                    height: outputHeight 
                },
                firstTimestampBehavior: 'offset'
            };
            
            if (hasAudio && config.audio && audioFormat) {
                muxerConfig.audio = {
                    codec: audioMuxerCodec,
                    sampleRate: audioFormat.sampleRate,
                    numberOfChannels: audioFormat.numberOfChannels
                };
            }
            
            muxer = new WebMMuxer(muxerConfig);
        } else {
            // MP4 muxer configuration
            const muxerConfig = {
                target: new MP4Target(fileStream),
                video: { 
                    codec: videoMuxerCodec,
                    width: outputWidth, 
                    height: outputHeight 
                },
                fastStart: false,
                firstTimestampBehavior: 'offset'
            };

            if (hasAudio && config.audio && audioFormat) {
                muxerConfig.audio = {
                    codec: audioMuxerCodec,
                    sampleRate: audioFormat.sampleRate,
                    numberOfChannels: audioFormat.numberOfChannels
                };
            }

            muxer = new MP4Muxer(muxerConfig);
        }

        videoEncoder = new VideoEncoder({
            output: (chunk, meta) => {
                // Silently ignore chunks that arrive after muxer finalization
                // This can happen with VP9/VP8 encoders which may have delayed callbacks
                if (muxerFinalized) {
                    console.warn('VideoEncoder output callback fired after muxer finalization - ignoring chunk');
                    return;
                }
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
            width: outputWidth,
            height: outputHeight,
            bitrate: config.video.bitrate,
            framerate: outputFramerate,
            latencyMode: 'quality'
        });

        if (hasAudio && config.audio && audioFormat) {
            audioEncoder = new AudioEncoder({
                output: (chunk, meta) => {
                    // Silently ignore chunks that arrive after muxer finalization
                    // This can happen with some audio encoders which may have delayed callbacks
                    if (muxerFinalized) {
                        console.warn('AudioEncoder output callback fired after muxer finalization - ignoring chunk');
                        return;
                    }
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
            // Apply AAC bitrate rounding to valid values if needed
            let audioBitrate = config.audio.bitrate;
            if (isAACCodec(config.audio.codec)) {
                // AAC-LC and AAC-HE: Round to nearest valid value using shared utility
                audioBitrate = validateAudioBitrate(config.audio.codec, audioBitrate);
            }
            
            audioEncoder.configure({
                codec: config.audio.codec ?? 'mp4a.40.2',
                sampleRate: audioFormat.sampleRate,
                numberOfChannels: audioFormat.numberOfChannels,
                bitrate: audioBitrate
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

    // Check if aborted after demuxing
    if (aborted || (signal && signal.aborted)) {
        throw new DOMException('Encoding was cancelled', 'AbortError');
    }

    // Flush encoders and wait for all output callbacks to complete
    try {
        await videoEncoder.flush();
    } catch (e) {
        console.error('VideoEncoder flush error:', e);
    }
    
    // Check if aborted after video flush
    if (aborted || (signal && signal.aborted)) {
        throw new DOMException('Encoding was cancelled', 'AbortError');
    }
    
    if (audioEncoder) {
        try {
            await audioEncoder.flush();
        } catch (e) {
            console.error('AudioEncoder flush error:', e);
        }
    }
    
    // Check if aborted after audio flush
    if (aborted || (signal && signal.aborted)) {
        throw new DOMException('Encoding was cancelled', 'AbortError');
    }
    
    // Mark encoding as complete and check if we can finalize
    encodingComplete = true;
    checkIfComplete();
    
    // Wait for all pending chunks to be written to muxer
    await allChunksWrittenPromise;
    
    // Check if aborted before finalizing
    if (aborted || (signal && signal.aborted)) {
        throw new DOMException('Encoding was cancelled', 'AbortError');
    }
    
    // Set progress to 100% when encoding is complete
    onProgress(100);
    
    // Mark muxer as finalized to prevent late encoder callbacks from adding chunks
    muxerFinalized = true;
    
    // Now safe to finalize - all chunks have been written
    muxer.finalize();
    await fileStream.close();
}