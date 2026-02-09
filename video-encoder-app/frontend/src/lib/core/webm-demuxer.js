import MkvDemuxer from 'mkv-demuxer';

/**
 * WebM/Matroska demuxer using mkv-demuxer
 * Parses WebM container and feeds samples to WebCodecs decoders
 * @param {File} file
 * @param {VideoDecoder} videoDecoder
 * @param {AudioDecoder|null} audioDecoder
 * @param {Function} onReady - Callback with detected format info
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<{hasAudio: boolean}>}
 */
export async function demuxWebM(file, videoDecoder, audioDecoder, onReady, onProgress) {
    const demuxer = new MkvDemuxer();
    const filePieceSize = 1 * 1024 * 1024; // 1MB chunks
    
    try {
        // Initialize the demuxer with the file
        // Note: mkv-demuxer may log "invalid file size" warnings for certain files,
        // but this is usually non-fatal and the file can still be processed
        console.log(`Initializing WebM demuxer for file: ${file.name} (${file.size} bytes)`);
        await demuxer.initFile(file, filePieceSize);
        onProgress(10); // File loaded
        
        // Get metadata
        const meta = await demuxer.getMeta();
        onProgress(20); // Metadata parsed
        
        console.log('━━━ WebM Metadata ━━━');
        console.log('Video track:', meta.video);
        console.log('Audio track:', meta.audio);
        console.log('Info:', meta.info);
        
        // Check if audio track exists
        const hasAudio = !!meta.audio && !!audioDecoder;
        
        // Configure video decoder
        if (meta.video) {
            const videoCodecPrivate = meta.video.codecPrivate ? new Uint8Array(meta.video.codecPrivate) : null;
            const videoCodec = getWebCodecsVideoCodec(meta.video.codecID, meta.video, videoCodecPrivate);
            if (!videoCodec) {
                throw new Error(`Unsupported video codec: ${meta.video.codecID}`);
            }
            
            const videoConfig = {
                codec: videoCodec,
                codedWidth: meta.video.width,
                codedHeight: meta.video.height,
            };
            
            // Add codec private data if available (needed for VP8/VP9/AV1)
            if (meta.video.codecPrivate && meta.video.codecPrivate.byteLength > 0) {
                videoConfig.description = new Uint8Array(meta.video.codecPrivate);
                console.log(`VideoDecoder using description buffer (${videoConfig.description.length} bytes)`);
            }
            
            console.log(`Configuring VideoDecoder: codec=${videoConfig.codec}, ${meta.video.width}x${meta.video.height}`);
            
            // Check if this configuration is supported before attempting to configure
            try {
                const support = await VideoDecoder.isConfigSupported(videoConfig);
                if (!support.supported) {
                    console.warn('VideoDecoder configuration not fully supported:', videoConfig);
                    throw new Error(`VideoDecoder does not support codec configuration: ${videoConfig.codec} ${meta.video.width}x${meta.video.height}`);
                }
                console.log('VideoDecoder configuration is supported');
            } catch (e) {
                console.error('Error checking VideoDecoder support:', e);
                // Continue anyway - some browsers may not support isConfigSupported
            }
            
            videoDecoder.configure(videoConfig);
            console.log('VideoDecoder configured successfully');
        }
        
        // Configure audio decoder if audio track exists
        if (hasAudio && meta.audio) {
            const audioCodec = getWebCodecsAudioCodec(meta.audio.codecID);
            if (!audioCodec) {
                throw new Error(`Unsupported audio codec: ${meta.audio.codecID}`);
            }
            
            const audioConfig = {
                codec: audioCodec,
                sampleRate: meta.audio.rate || 48000,
                numberOfChannels: meta.audio.channels || 2,
            };
            
            // Add codec private data if available (needed for Opus/Vorbis)
            if (meta.audio.codecPrivate && meta.audio.codecPrivate.byteLength > 0) {
                audioConfig.description = new Uint8Array(meta.audio.codecPrivate);
                console.log(`AudioDecoder using description buffer (${audioConfig.description.length} bytes)`);
            }
            
            console.log(`Configuring AudioDecoder: codec=${audioConfig.codec}, sampleRate=${audioConfig.sampleRate}, channels=${audioConfig.numberOfChannels}`);
            audioDecoder.configure(audioConfig);
            console.log('AudioDecoder configured successfully');
        }
        
        // Get all video and audio packets
        const data = await demuxer.getData();
        onProgress(30); // Data indexed
        
        console.log(`WebM file loaded: ${data.videoPackets?.length || 0} video frames, ${data.audioPackets?.length || 0} audio frames`);
        
        // Calculate format information
        // Note: mkv-demuxer returns duration in MILLISECONDS, not seconds
        const durationMs = meta.info?.duration || 0;
        const duration = durationMs / 1000; // Convert to seconds
        const totalFrames = data.videoPackets?.length || 0;
        const framerate = totalFrames > 0 && duration > 0 ? totalFrames / duration : null;
        
        console.log(`WebM duration: ${durationMs}ms (${duration.toFixed(2)}s), framerate: ${framerate ? framerate.toFixed(2) : 'unknown'} fps`);
        
        // Estimate bitrates
        const videoBitrate = totalFrames > 0 && duration > 0 
            ? Math.round((file.size * 8) / duration / 1000000) // Convert to Mbps
            : null;
        const audioBitrate = hasAudio && meta.audio?.rate 
            ? Math.round(meta.audio.bitDepth * meta.audio.rate * meta.audio.channels / 1000) // Convert to Kbps
            : null;
        
        // Prepare detected format info
        const detectedFormat = {
            hasAudio,
            totalFrames,
        };
        
        if (meta.video) {
            detectedFormat.videoFormat = {
                width: meta.video.width,
                height: meta.video.height,
                codec: meta.video.codecID,
                framerate,
                bitrate: videoBitrate,
            };
        }
        
        if (hasAudio && meta.audio) {
            detectedFormat.audioFormat = {
                sampleRate: meta.audio.rate || 48000,
                numberOfChannels: meta.audio.channels || 2,
                bitrate: audioBitrate,
            };
        }
        
        // Call onReady with detected format
        onReady(detectedFormat);
        
        // Sort video packets by timestamp to ensure monotonically increasing timestamps
        // WebM/Matroska packets may not be stored in timestamp order
        if (data.videoPackets && data.videoPackets.length > 0) {
            console.log(`Sorting ${data.videoPackets.length} video packets by timestamp...`);
            data.videoPackets.sort((a, b) => a.timestamp - b.timestamp);
        }
        
        // Sort audio packets by timestamp as well
        if (data.audioPackets && data.audioPackets.length > 0) {
            console.log(`Sorting ${data.audioPackets.length} audio packets by timestamp...`);
            data.audioPackets.sort((a, b) => a.timestamp - b.timestamp);
        }
        
        // Process video frames with backpressure management
        if (data.videoPackets && data.videoPackets.length > 0) {
            const totalFrames = data.videoPackets.length;
            let lastProgressUpdate = 0;
            const progressInterval = Math.max(1, Math.floor(totalFrames / 100)); // Update max 100 times
            const MAX_DECODE_QUEUE_SIZE = 30; // Prevent overwhelming decoder
            
            for (let i = 0; i < totalFrames; i++) {
                const packet = data.videoPackets[i];
                
                // Read frame data from file
                const frameData = await readFileChunk(file, packet.start, packet.end);
                
                // Create EncodedVideoChunk
                const chunk = new EncodedVideoChunk({
                    type: packet.isKeyframe ? 'key' : 'delta',
                    timestamp: packet.timestamp * 1000, // Convert to microseconds
                    data: frameData,
                });
                
                // Backpressure: Wait if decoder queue is full
                while (videoDecoder.decodeQueueSize >= MAX_DECODE_QUEUE_SIZE) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                
                // Check decoder state before decoding
                if (videoDecoder.state !== 'configured') {
                    console.error(`VideoDecoder not ready at frame ${i}/${totalFrames}, state: ${videoDecoder.state}`);
                    throw new Error(`VideoDecoder closed or failed at frame ${i}/${totalFrames}. The decoder may have encountered an error with a previous frame.`);
                }
                
                // Decode the chunk
                videoDecoder.decode(chunk);
                
                // Throttle progress updates - only update every progressInterval frames
                if (i - lastProgressUpdate >= progressInterval || i === totalFrames - 1) {
                    const progress = 30 + Math.round((i / totalFrames) * 65);
                    onProgress(progress);
                    lastProgressUpdate = i;
                }
                
                // Add small yield every 50 frames to prevent blocking UI
                if (i % 50 === 0 && i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        }
        
        // Process audio frames with backpressure management
        if (hasAudio && data.audioPackets && data.audioPackets.length > 0) {
            const MAX_AUDIO_QUEUE_SIZE = 30; // Prevent overwhelming audio decoder
            
            for (let i = 0; i < data.audioPackets.length; i++) {
                const packet = data.audioPackets[i];
                
                // Read frame data from file
                const frameData = await readFileChunk(file, packet.start, packet.end);
                
                // Create EncodedAudioChunk
                const chunk = new EncodedAudioChunk({
                    type: 'key', // Audio chunks are always key frames
                    timestamp: packet.timestamp * 1000, // Convert to microseconds
                    data: frameData,
                });
                
                // Backpressure: Wait if decoder queue is full
                while (audioDecoder.decodeQueueSize >= MAX_AUDIO_QUEUE_SIZE) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                
                // Check decoder state before decoding
                if (audioDecoder.state !== 'configured') {
                    console.error(`AudioDecoder not ready at frame ${i}/${data.audioPackets.length}, state: ${audioDecoder.state}`);
                    throw new Error(`AudioDecoder closed or failed at frame ${i}/${data.audioPackets.length}`);
                }
                
                // Decode the chunk
                audioDecoder.decode(chunk);
            }
        }
        
        onProgress(95); // Decoding complete
        
        // Wait for decoders to finish
        await videoDecoder.flush();
        if (hasAudio && audioDecoder) {
            await audioDecoder.flush();
        }
        
        onProgress(100); // All done
        
        return { hasAudio };
        
    } catch (error) {
        console.error('WebM demuxing error:', error);
        throw new Error(`WebM demuxing failed: ${error.message}`);
    }
}

/**
 * Read a chunk of data from a file
 * @param {File} file
 * @param {number} start - Start byte position
 * @param {number} end - End byte position
 * @returns {Promise<Uint8Array>}
 */
function readFileChunk(file, start, end) {
    return new Promise((resolve, reject) => {
        const blob = file.slice(start, end);
        const reader = new FileReader();
        
        reader.onload = () => {
            resolve(new Uint8Array(reader.result));
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file chunk'));
        };
        
        reader.readAsArrayBuffer(blob);
    });
}

/**
 * Parse AV1 codec string from CodecPrivate (AV1CodecConfigurationRecord)
 * @param {Uint8Array} codecPrivate - AV1 codec private data (av1C box)
 * @returns {string|null} - Parsed codec string or null if invalid
 */
function parseAV1CodecString(codecPrivate) {
    if (!codecPrivate || codecPrivate.length < 4) {
        return null;
    }
    
    try {
        // AV1CodecConfigurationRecord structure:
        // Byte 0: marker (1 bit) + version (7 bits)
        // Byte 1: seq_profile (3 bits) + seq_level_idx_0 (5 bits)
        // Byte 2: tier (1 bit) + high_bitdepth (1 bit) + ...
        // Byte 3: chroma info...
        
        const byte1 = codecPrivate[1];
        const byte2 = codecPrivate[2];
        
        // Extract seq_profile (top 3 bits of byte 1)
        const seq_profile = (byte1 >> 5) & 0x07;
        
        // Extract seq_level_idx (bottom 5 bits of byte 1)
        const seq_level_idx = byte1 & 0x1F;
        
        // Extract tier (top bit of byte 2): 0=M (Main), 1=H (High)
        const tier = (byte2 >> 7) & 0x01;
        const tierStr = tier ? 'H' : 'M';
        
        // Extract bit depth info
        const high_bitdepth = (byte2 >> 6) & 0x01;
        const twelve_bit = (byte2 >> 5) & 0x01;
        let bitdepth = 8;
        if (high_bitdepth) {
            bitdepth = twelve_bit ? 12 : 10;
        }
        
        // Format as 2-digit hex for level
        const levelHex = seq_level_idx.toString(16).padStart(2, '0').toUpperCase();
        
        // Build codec string: av01.P.LLT.DD
        // P = profile (0, 1, 2)
        // LL = level (hex)
        // T = tier (M or H)
        // DD = bit depth (08, 10, 12)
        const codec = `av01.${seq_profile}.${levelHex}${tierStr}.${bitdepth.toString().padStart(2, '0')}`;
        
        console.log(`AV1 codec parsed from CodecPrivate: ${codec} (profile=${seq_profile}, level=${seq_level_idx}, tier=${tierStr}, bitdepth=${bitdepth})`);
        
        return codec;
    } catch (error) {
        console.error('Error parsing AV1 codec string:', error);
        return null;
    }
}

/**
 * Convert Matroska codec ID to WebCodecs codec string for video
 * @param {string} codecID - Matroska codec ID (e.g., "V_VP8", "V_VP9", "V_AV1")
 * @param {Object} videoMeta - Video metadata from mkv-demuxer
 * @param {Uint8Array} codecPrivate - Codec private data
 * @returns {string|null} - WebCodecs codec string or null if unsupported
 */
function getWebCodecsVideoCodec(codecID, videoMeta, codecPrivate) {
    if (codecID === 'V_VP8') {
        return 'vp8';
    }
    
    if (codecID === 'V_VP9') {
        // VP9 Profile 0, Level 1.0, 8-bit (common default)
        // For better compatibility, use generic VP9
        return 'vp09.00.10.08';
    }
    
    if (codecID === 'V_AV1') {
        // Try to parse actual codec string from CodecPrivate first
        if (codecPrivate && codecPrivate.length >= 4) {
            const parsedCodec = parseAV1CodecString(codecPrivate);
            if (parsedCodec) {
                return parsedCodec;
            }
        }
        
        // Fallback: Derive AV1 level from resolution
        // AV1 spec defines levels based on resolution and framerate
        const width = videoMeta?.width || 0;
        const height = videoMeta?.height || 0;
        const pixels = width * height;
        
        let level = '04M'; // Level 3.0 (default for up to 1080p)
        
        // Determine level based on resolution
        // Reference: AV1 Bitstream & Decoding Process Specification
        if (pixels <= 147456) { // 512x288 or smaller
            level = '00M'; // Level 2.0
        } else if (pixels <= 278784) { // 640x480 or smaller  
            level = '01M'; // Level 2.1
        } else if (pixels <= 665856) { // 1024x768 or smaller
            level = '02M'; // Level 2.2/2.3
        } else if (pixels <= 2228224) { // 1920x1088 or smaller (1080p)
            level = '04M'; // Level 3.0
        } else if (pixels <= 8912896) { // 3840x2160 or smaller (4K)
            level = '08M'; // Level 4.0
        } else if (pixels <= 35651584) { // 7680x4320 or smaller (8K)
            level = '0DM'; // Level 5.1
        } else {
            level = '12M'; // Level 6.0 (highest)
        }
        
        console.log('AV1 codec derived (fallback): av01.0.' + level + '.08 for ' + width + 'x' + height + ' (' + pixels + ' pixels)');
        
        // AV1 codec string: av01.P.LLT.DD
        // P = profile (0 = Main)
        // P = profile (0 = Main)
        // LL = level
        // T = tier (M = Main, H = High)
        // DD = bit depth (08 = 8-bit, 10 = 10-bit)
        const codec = `av01.0.${level}.08`;
        console.log(`AV1 codec derived: ${codec} for ${width}x${height} (${pixels} pixels)`);
        return codec;
    }
    
    return null;
}

/**
 * Convert Matroska codec ID to WebCodecs codec string for audio
 * @param {string} codecID - Matroska codec ID (e.g., "A_OPUS", "A_VORBIS")
 * @returns {string|null} - WebCodecs codec string or null if unsupported
 */
function getWebCodecsAudioCodec(codecID) {
    const codecMap = {
        'A_OPUS': 'opus',
        'A_VORBIS': 'vorbis',
    };
    
    return codecMap[codecID] || null;
}

