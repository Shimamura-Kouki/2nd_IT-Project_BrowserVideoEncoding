import { Muxer as MP4Muxer, FileSystemWritableFileStreamTarget as MP4Target, ArrayBufferTarget as MP4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebMMuxer, FileSystemWritableFileStreamTarget as WebMTarget, ArrayBufferTarget as WebMArrayBufferTarget } from 'webm-muxer';
import { demuxAndDecode } from './demuxer.js';
import { validateAudioBitrate, isAACCodec } from '../utils/audioUtils.js';
import { KEYFRAME_INTERVAL_SECONDS } from '../constants.js';

// Helper class to unify ArrayBufferTarget interface between mp4-muxer and webm-muxer
class ArrayBufferTarget {
    constructor(container) {
        this.container = container;
        this.target = container === 'webm' ? new WebMArrayBufferTarget() : new MP4ArrayBufferTarget();
    }
    
    get buffer() {
        return this.target.buffer;
    }
}

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
    
    // Check if File System Access API is supported (not available in Firefox)
    const supportsFileSystemAccess = 'showSaveFilePicker' in window;
    
    let fileStream;
    let bufferTarget;
    
    if (supportsFileSystemAccess) {
        const handle = await window.showSaveFilePicker({
            suggestedName: suggestedName,
            types: [{ description: 'Video File', accept: { [mimeType]: [fileExtension] } }]
        });
        fileStream = await handle.createWritable();
    } else {
        // Fallback for browsers without File System Access API (e.g., Firefox)
        // Use ArrayBufferTarget to collect data in memory, then trigger download
        console.log('File System Access API not supported, using in-memory buffer fallback');
        bufferTarget = new ArrayBufferTarget(container);
    }

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
    
    // Track pending chunks to ensure all are written before finalization
    // This prevents the race condition where muxer.finalize() is called
    // while encoder output callbacks are still adding chunks
    let pendingVideoChunks = 0;
    let pendingAudioChunks = 0;
    let encodingComplete = false;
    let muxerFinalized = false; // Flag to track if muxer has been finalized
    
    // Track when chunks last arrived to detect when encoding is truly complete
    let lastVideoChunkTime = 0;
    let lastAudioChunkTime = 0;
    let totalVideoChunksReceived = 0;
    let totalAudioChunksReceived = 0;
    
    // Track if encoders have started producing output
    // Critical: don't finalize until video encoder has started (if video exists)
    let videoEncoderStarted = false;
    let audioEncoderStarted = false;
    let hasVideoTrack = true; // Assume true until we know otherwise
    let hasAudioTrack = false; // Will be set based on config
    
    // Guard flag to prevent multiple initializations
    // This prevents the race condition where initializeEncoders is called multiple times
    // (e.g., if demuxer's onReady callback fires multiple times)
    // causing multiple muxer instances and encoder reconfigurations
    let encodersInitialized = false;

    // Callback to initialize muxer and encoders once we know the detected format
    const initializeEncoders = (detectedFormat) => {
        // Guard against multiple initializations
        // If mp4boxfile.onReady fires multiple times, we should ignore subsequent call
        if (encodersInitialized) {
            console.warn('initializeEncoders called multiple times - ignoring subsequent call');
            return;
        }
        encodersInitialized = true;
        
        const { hasAudio, audioFormat, videoFormat, totalFrames: frames } = detectedFormat;
        totalFrames = frames ?? 0; // Store total frames for progress calculation
        
        // Track if we have audio track
        hasAudioTrack = hasAudio && config.audio;
        
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
                target: fileStream ? new WebMTarget(fileStream) : bufferTarget.target,
                video: { 
                    codec: videoMuxerCodec,
                    width: outputWidth, 
                    height: outputHeight 
                },
                firstTimestampBehavior: 'offset'
                // Note: No streaming parameter specified (uses default behavior)
                // 
                // webm-muxer v5.x limitation with FileSystemWritableFileStreamTarget:
                // - Default (no streaming param): Writes cues for seeking, but buffers into
                //   large clusters. Results in slow seeking but it works.
                // - streaming:true: Creates clusters immediately but does NOT write cues.
                //   Results in completely broken seeking (INPUT_CONTROL_SET_POSITION fails).
                //
                // Trade-off: We prioritize working (but slow) seeking over broken seeking.
                // For better seeking performance, users should use MP4 container instead.
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
                target: fileStream ? new MP4Target(fileStream) : bufferTarget.target,
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
                // Mark that video encoder has started producing chunks
                if (!videoEncoderStarted) {
                    videoEncoderStarted = true;
                    console.log('✓ Video encoder started producing chunks');
                }
                
                // Increment counter first to ensure proper tracking
                pendingVideoChunks++;
                totalVideoChunksReceived++;
                lastVideoChunkTime = performance.now();
                
                try {
                    // Ignore chunks that arrive after muxer finalization with a warning
                    // This can happen with VP9/VP8 encoders which may have delayed callbacks
                    if (muxerFinalized) {
                        console.warn(`VideoEncoder output callback fired after muxer finalization - ignoring chunk ${totalVideoChunksReceived}`);
                        return;
                    }
                    muxer.addVideoChunk(chunk, meta);
                } finally {
                    pendingVideoChunks--;
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
            latencyMode: 'quality',
            keyInterval: Math.max(1, Math.round(outputFramerate * KEYFRAME_INTERVAL_SECONDS))
        });

        if (hasAudio && config.audio && audioFormat) {
            audioEncoder = new AudioEncoder({
                output: (chunk, meta) => {
                    // Mark that audio encoder has started producing chunks
                    if (!audioEncoderStarted) {
                        audioEncoderStarted = true;
                        console.log('✓ Audio encoder started producing chunks');
                    }
                    
                    // Increment counter first to ensure proper tracking
                    pendingAudioChunks++;
                    totalAudioChunksReceived++;
                    lastAudioChunkTime = performance.now();
                    
                    try {
                        // Ignore chunks that arrive after muxer finalization with a warning
                        // This can happen with some audio encoders which may have delayed callbacks
                        if (muxerFinalized) {
                            console.warn(`AudioEncoder output callback fired after muxer finalization - ignoring chunk ${totalAudioChunksReceived}`);
                            return;
                        }
                        muxer.addAudioChunk(chunk, meta);
                    } finally {
                        pendingAudioChunks--;
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
    
    // Mark encoding as complete
    encodingComplete = true;
    
    // Wait until no new chunks have arrived for a sustained period
    // This is critical for VP9/VP8/AV1 encoders which continue to fire callbacks after flush()
    // IMPORTANT: Video encoder may start much later than audio encoder (can be seconds)
    // IMPORTANT: Video chunks may arrive very slowly (100-200ms apart) for complex codecs
    // IMPORTANT: Firefox AV1 encoder is EXTREMELY slow (~5fps vs Chrome ~35fps)
    //            This is a browser implementation limitation - Firefox can have >10s gaps between chunks
    const CHUNK_IDLE_TIMEOUT_MS = 500; // Wait 500ms of no new chunks (increased from 300ms)
    const MAX_STALL_TIME_MS = 60000; // Maximum time without ANY chunks arriving before considering stalled (60s)
                                     // Increased from 30s to accommodate Firefox's extremely slow AV1 encoder
    const POLL_INTERVAL_MS = 50; // Check every 50ms
    
    console.log('Waiting for all encoder chunks to complete...');
    console.log(`Initial state: video chunks received=${totalVideoChunksReceived}, audio chunks received=${totalAudioChunksReceived}`);
    console.log(`Expected encoders: video=${hasVideoTrack ? 'yes' : 'no'}, audio=${hasAudioTrack ? 'yes' : 'no'}`);
    if (totalFrames > 0) {
        console.log(`Expected frames: ${totalFrames}`);
    }
    
    const waitStartTime = performance.now();
    let lastCheckTime = waitStartTime;
    let lastTotalVideoChunks = totalVideoChunksReceived;
    let lastTotalAudioChunks = totalAudioChunksReceived;
    let lastChunkArrivalTime = waitStartTime; // Track when we last received ANY chunk
    let lastLogTime = waitStartTime; // Track when we last logged chunk progress (to avoid log spam)
    
    // Performance tracking: record time at each 10% milestone
    let videoEncodingStartTime = null; // When first video chunk arrives
    const milestones = []; // Array of {percent, chunks, time} for each 10% milestone
    
    // Poll until no new chunks arrive for CHUNK_IDLE_TIMEOUT_MS
    while (true) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        
        // Check if aborted during wait
        if (aborted || (signal && signal.aborted)) {
            throw new DOMException('Encoding was cancelled', 'AbortError');
        }
        
        const now = performance.now();
        const elapsedTotal = now - waitStartTime;
        const timeSinceLastChunk = now - lastChunkArrivalTime;
        
        // Safety timeout - only if encoding has truly stalled (no chunks for MAX_STALL_TIME_MS)
        // This allows slow encoders (like Firefox AV1) to take as long as needed, as long as they're making progress
        if (timeSinceLastChunk > MAX_STALL_TIME_MS) {
            console.warn(`Encoding appears stalled - no chunks for ${(timeSinceLastChunk / 1000).toFixed(1)}s`);
            console.warn(`Final state: video chunks=${totalVideoChunksReceived}, audio chunks=${totalAudioChunksReceived}, pending video=${pendingVideoChunks}, pending audio=${pendingAudioChunks}`);
            console.warn(`Encoder start status: video=${videoEncoderStarted}, audio=${audioEncoderStarted}`);
            if (totalFrames > 0 && totalVideoChunksReceived < totalFrames) {
                const coverage = ((totalVideoChunksReceived / totalFrames) * 100).toFixed(1);
                console.warn(`Only received ${totalVideoChunksReceived}/${totalFrames} chunks (${coverage}%) before stall`);
            }
            break;
        }
        
        // Check if new chunks arrived since last check
        if (totalVideoChunksReceived > lastTotalVideoChunks || totalAudioChunksReceived > lastTotalAudioChunks) {
            // New chunks arrived, reset the idle timer
            lastCheckTime = now;
            lastChunkArrivalTime = now; // Update last chunk arrival time
            
            // Track video encoding start time (when first video chunk arrives)
            if (totalVideoChunksReceived > 0 && videoEncodingStartTime === null) {
                videoEncodingStartTime = now;
            }
            
            // Track 10% milestones for performance analysis
            if (totalFrames > 0 && totalVideoChunksReceived > lastTotalVideoChunks) {
                const currentPercent = Math.floor((totalVideoChunksReceived / totalFrames) * 10) * 10; // 0, 10, 20, ..., 90, 100
                const lastPercent = Math.floor((lastTotalVideoChunks / totalFrames) * 10) * 10;
                
                // Check if we crossed a 10% milestone and haven't recorded it yet
                if (currentPercent > lastPercent && currentPercent > 0 && currentPercent <= 100) {
                    // Check if this milestone hasn't been recorded yet (avoid duplicates)
                    if (!milestones.some(m => m.percent === currentPercent)) {
                        // Record this milestone
                        milestones.push({
                            percent: currentPercent,
                            chunks: totalVideoChunksReceived,
                            time: now
                        });
                    }
                }
            }
            
            lastTotalVideoChunks = totalVideoChunksReceived;
            lastTotalAudioChunks = totalAudioChunksReceived;
            
            // Log progress periodically to avoid performance impact from excessive logging
            // Only log every 100 chunks OR every 2 seconds (whichever comes first)
            // Note: Excessive console.log can slow down encoding significantly
            if (totalVideoChunksReceived % 100 === 0 || (now - lastLogTime > 2000)) {
                console.log(`New chunks arrived: video=${totalVideoChunksReceived}, audio=${totalAudioChunksReceived}, resetting idle timer`);
                lastLogTime = now;
            }
            continue;
        }
        
        // CRITICAL CHECK: Don't finalize until video encoder has started producing chunks
        // Video encoder can start much later than audio encoder (especially for AV1)
        if (hasVideoTrack && !videoEncoderStarted) {
            // Video encoder hasn't started yet, keep waiting
            if (elapsedTotal > 2000 && elapsedTotal % 1000 < POLL_INTERVAL_MS) {
                // Log every second after 2 seconds
                console.log(`Still waiting for video encoder to start... (${(elapsedTotal / 1000).toFixed(1)}s elapsed)`);
            }
            lastCheckTime = now; // Reset idle timer since we're still waiting for video to start
            continue;
        }
        
        // Check if audio encoder should have started
        if (hasAudioTrack && !audioEncoderStarted) {
            // Audio encoder hasn't started yet, keep waiting
            if (elapsedTotal > 2000 && elapsedTotal % 1000 < POLL_INTERVAL_MS) {
                console.log(`Still waiting for audio encoder to start... (${(elapsedTotal / 1000).toFixed(1)}s elapsed)`);
            }
            lastCheckTime = now; // Reset idle timer since we're still waiting for audio to start
            continue;
        }
        
        // CRITICAL CHECK: If we know total frames, ensure we have received a reasonable number of chunks
        // Video chunks should be at least 90% of total frames before allowing idle timeout
        // (50% was too low - caused finalization at halfway point when chunks had a brief gap)
        if (hasVideoTrack && totalFrames > 0 && totalVideoChunksReceived < (totalFrames * 0.9)) {
            // We haven't received enough video chunks yet
            // Only log occasionally to avoid spam
            if (elapsedTotal % 2000 < POLL_INTERVAL_MS) {
                const progress = ((totalVideoChunksReceived / totalFrames) * 100).toFixed(1);
                console.log(`Still encoding: ${totalVideoChunksReceived}/${totalFrames} chunks (${progress}%), waiting for more...`);
            }
            lastCheckTime = now; // Reset idle timer since we're still expecting more chunks
            continue;
        }
        
        // CRITICAL CHECK: If we're still significantly below 100%, keep waiting
        // At 96.7%, 2000ms idle timeout was triggering, losing 3.3% of chunks and corrupting the video
        // Only allow idle timeout to finalize when we're very close to completion (≥99%)
        if (hasVideoTrack && totalFrames > 0 && totalVideoChunksReceived < (totalFrames * 0.99)) {
            // We're between 90-99%, keep waiting for more chunks
            // Don't allow idle timeout to trigger - rely on stall detection (10s) instead
            if (elapsedTotal % 2000 < POLL_INTERVAL_MS) {
                const progress = ((totalVideoChunksReceived / totalFrames) * 100).toFixed(1);
                console.log(`Still encoding: ${totalVideoChunksReceived}/${totalFrames} chunks (${progress}%), waiting for 99%+...`);
            }
            lastCheckTime = now; // Reset idle timer since we're still expecting more chunks
            continue;
        }
        
        // No new chunks since last check AND all expected encoders have started
        // AND we have enough chunks (≥99% or don't know expected count)
        // See if we've waited long enough
        const idleTime = now - lastCheckTime;
        
        // Use adaptive idle timeout based on chunk coverage
        // If we're still below expected count (99-100%), use a longer timeout
        let effectiveIdleTimeout = CHUNK_IDLE_TIMEOUT_MS; // 500ms default
        if (hasVideoTrack && totalFrames > 0 && totalVideoChunksReceived < totalFrames) {
            // We're at 99%+ but not quite 100% yet
            // Use a longer idle timeout (3 seconds) to ensure we get the last few chunks
            effectiveIdleTimeout = 3000;
        }
        
        if (idleTime >= effectiveIdleTimeout) {
            // No chunks for effectiveIdleTimeout - we're done
            console.log(`No new chunks for ${effectiveIdleTimeout}ms, encoding complete`);
            console.log(`Final state: video chunks=${totalVideoChunksReceived}, audio chunks=${totalAudioChunksReceived}`);
            if (totalFrames > 0) {
                const coverage = ((totalVideoChunksReceived / totalFrames) * 100).toFixed(1);
                console.log(`Video chunk coverage: ${totalVideoChunksReceived}/${totalFrames} (${coverage}%)`);
                if (totalVideoChunksReceived < totalFrames) {
                    console.warn(`WARNING: Finalizing with incomplete video - missing ${totalFrames - totalVideoChunksReceived} chunks (${(100 - parseFloat(coverage)).toFixed(1)}%)`);
                }
            }
            
            // Log performance metrics
            if (videoEncodingStartTime !== null && totalVideoChunksReceived > 0) {
                const totalEncodingTime = (now - videoEncodingStartTime) / 1000; // seconds
                
                // Guard against division by zero
                if (totalEncodingTime > 0) {
                    const averageFps = totalVideoChunksReceived / totalEncodingTime;
                    
                    console.log('\n=== Encoding Performance Metrics ===');
                    console.log(`Total encoding time: ${totalEncodingTime.toFixed(2)}s`);
                    console.log(`Average FPS: ${averageFps.toFixed(1)} fps`);
                    
                    // Calculate FPS for each 10% segment
                    if (milestones.length > 0) {
                        console.log('\nFPS per 10% segment:');
                        
                        let prevPercent = 0;
                        let prevChunks = 0;
                        let prevTime = videoEncodingStartTime;
                        
                        for (const milestone of milestones) {
                            const chunksDiff = milestone.chunks - prevChunks;
                            const timeDiff = (milestone.time - prevTime) / 1000; // seconds
                            
                            // Guard against division by zero
                            if (timeDiff > 0) {
                                const segmentFps = chunksDiff / timeDiff;
                                console.log(`  ${prevPercent}%-${milestone.percent}%: ${segmentFps.toFixed(1)} fps (${chunksDiff} chunks in ${timeDiff.toFixed(2)}s)`);
                            } else {
                                console.log(`  ${prevPercent}%-${milestone.percent}%: N/A (${chunksDiff} chunks in <0.01s)`);
                            }
                            
                            prevPercent = milestone.percent;
                            prevChunks = milestone.chunks;
                            prevTime = milestone.time;
                        }
                        
                        // Add final segment if not at 100% or if we have chunks after the last milestone
                        const currentPercent = Math.floor((totalVideoChunksReceived / totalFrames) * 10) * 10;
                        if (prevPercent < 100 && totalVideoChunksReceived > prevChunks) {
                            const chunksDiff = totalVideoChunksReceived - prevChunks;
                            const timeDiff = (now - prevTime) / 1000;
                            
                            // Guard against division by zero
                            if (timeDiff > 0) {
                                const segmentFps = chunksDiff / timeDiff;
                                const finalPercent = Math.min(100, currentPercent);
                                console.log(`  ${prevPercent}%-${finalPercent}%: ${segmentFps.toFixed(1)} fps (${chunksDiff} chunks in ${timeDiff.toFixed(2)}s)`);
                            } else {
                                const finalPercent = Math.min(100, currentPercent);
                                console.log(`  ${prevPercent}%-${finalPercent}%: N/A (${chunksDiff} chunks in <0.01s)`);
                            }
                        }
                    }
                    console.log('====================================\n');
                } else {
                    console.log('\n=== Encoding Performance Metrics ===');
                    console.log('Encoding completed too quickly to measure (< 0.01s)');
                    console.log('====================================\n');
                }
            }
            
            break;
        }
    }
    
    // Wait for any pending chunks to finish writing
    if (pendingVideoChunks > 0 || pendingAudioChunks > 0) {
        console.log(`Waiting for pending chunks to finish: video=${pendingVideoChunks}, audio=${pendingAudioChunks}`);
        const pendingWaitStart = performance.now();
        while ((pendingVideoChunks > 0 || pendingAudioChunks > 0) && (performance.now() - pendingWaitStart < 1000)) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        if (pendingVideoChunks > 0 || pendingAudioChunks > 0) {
            console.warn(`Still have pending chunks after 1s wait: video=${pendingVideoChunks}, audio=${pendingAudioChunks}`);
        }
    }
    
    // Set progress to 100% when encoding is complete
    onProgress(100);
    
    // Mark muxer as finalized to prevent late encoder callbacks from adding chunks
    // This MUST be set before calling muxer.finalize() to prevent race condition
    muxerFinalized = true;
    
    // Now safe to finalize - all chunks have been written
    muxer.finalize();
    
    if (fileStream) {
        await fileStream.close();
    } else {
        // For browsers without File System Access API, trigger a download
        const buffer = bufferTarget.buffer;
        const blob = new Blob([buffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        a.click();
        URL.revokeObjectURL(url);
        console.log('File download triggered:', suggestedName);
    }
}