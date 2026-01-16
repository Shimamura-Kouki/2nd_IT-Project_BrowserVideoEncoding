// Encoder: WebCodecs で再エンコードし、mp4-muxer で FileSystem へ保存
// Muxer と FileSystemWritableFileStreamTarget は index.html で window.Mp4MuxerClasses に設定される

// onProgress の呼び出し形式: onProgress({ stage, percent, fps, elapsedMs })
// stage: 'demuxing' (ファイル読み込み&デマックス), 'encoding' (エンコード)

export async function encodeToFile(file, config, onProgress, demuxAndDecode) {
    console.log('encodeToFile started');

    console.log('Opening save file picker...');
    const handle = await window.showSaveFilePicker({
        suggestedName: 'output.mp4',
        types: [{ description: 'Video File', accept: { 'video/mp4': ['.mp4'] } }]
    });
    console.log('File picker completed');
    const fileStream = await handle.createWritable();

    let frameCount = 0;
    const start = performance.now();
    let videoChunkCount = 0;
    let videoChunkAddedCount = 0;
    let audioChunkCount = 0;
    let audioChunkAddedCount = 0;
    let muxer = null;
    let audioEncoder = null;
    let audioEncoderClosed = false;
    let totalVideoDurationUs = 0;
    let encodedVideoUs = 0;
    let videoBaseTsUs = null;
    let audioBaseTsUs = null;
    let muxerInitialized = false;
    let detectedAudioFormat = null;
    
    // Track expected frame count and completion
    let expectedFrameCount = 0;
    let encodingComplete = null;
    let encodingCompleted = false;
    const encodingCompletePromise = new Promise((resolve) => {
        encodingComplete = resolve;
    });

    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
            videoChunkCount++;
            if (videoChunkCount === 1) {
                console.log('🎬 FIRST VIDEO CHUNK:', {
                    size: chunk.byteLength,
                    timestamp: chunk.timestamp,
                    duration: chunk.duration,
                    type: chunk.type,
                    isKeyFrame: chunk.type === 'key'
                });
            }
            if (muxerInitialized && muxer) {
                // addVideoChunkRaw() expects timestamps and durations in microseconds
                const tsUs = Number(chunk.timestamp) || 0;
                const durUs = Number(chunk.duration) || 0;

                if (videoBaseTsUs === null) {
                    videoBaseTsUs = tsUs;
                    console.log('videoBaseTsUs initialized:', videoBaseTsUs);
                }
                const normalizedTsUs = Math.max(0, tsUs - videoBaseTsUs);

                try {
                    if (videoChunkCount <= 3 || videoChunkCount % 500 === 0) {
                        console.log(`[CHUNK ${videoChunkCount}] ts: ${normalizedTsUs.toFixed(2)}us, dur: ${durUs.toFixed(2)}us, type: ${chunk.type}`);
                    }

                    // addVideoChunkRaw() expects timestamp and duration in microseconds
                    const data = new Uint8Array(chunk.byteLength);
                    chunk.copyTo(data);
                    muxer.addVideoChunkRaw(data, chunk.type, normalizedTsUs, durUs, meta);

                    videoChunkAddedCount++;
                } catch (e) {
                    // エラー内容を詳細に記録
                    console.error(`✗ Failed to add chunk #${videoChunkCount}:`, {
                        message: e.message,
                        timestamp: tsUs,
                        normalizedTsUs: normalizedTsUs,
                        duration: durUs,
                        chunk_type: chunk.type,
                        full_error: e.toString()
                    });
                    // timestamp エラー以外は再スロー
                    if (!e.message?.includes('timestamp')) {
                        throw e;
                    }
                }
            }
            // エンコード進捗を、エンコード済みのタイムスタンプで推定
            if (totalVideoDurationUs > 0) {
                const tsRaw = Number(chunk.timestamp) || 0;
                const dur = Number(chunk.duration) || 0;
                const base = videoBaseTsUs ?? tsRaw;
                const tsNorm = Math.max(0, tsRaw - base);
                encodedVideoUs = Math.max(encodedVideoUs, tsNorm + dur);
                const encPercent = Math.min(100, 100 * (encodedVideoUs / totalVideoDurationUs));
                if (videoChunkCount % 100 === 0) {
                    console.log('Encoding progress:', encPercent.toFixed(1) + '%, encoded:', encodedVideoUs, 'total:', totalVideoDurationUs);
                }
                onProgress({ stage: 'encoding', percent: encPercent, fps: undefined, elapsedMs: performance.now() - start });
            } else if (videoChunkCount === 1) {
                console.log('Warning: totalVideoDurationUs is', totalVideoDurationUs);
            }
            
            // Check if all expected chunks have been encoded
            // Note: expectedFrameCount > 0 guard prevents premature resolution if chunks arrive
            // before expectedFrameCount is set (after demuxAndDecode completes)
            if (expectedFrameCount > 0 && videoChunkCount >= expectedFrameCount && !encodingCompleted) {
                console.log('All expected video chunks encoded:', videoChunkCount, '/', expectedFrameCount);
                encodingCompleted = true;
                encodingComplete();
            }
        },
        error: (e) => console.error('VideoEncoder error', e)
    });

    // VideoEncoderは初期設定（実際の設定は後でonReadyコールバック内で行う）
    videoEncoder.configure({
        codec: config.video.codec ?? 'avc1.640028',
        width: config.video.width,
        height: config.video.height,
        bitrate: config.video.bitrate,
        framerate: config.video.framerate,
        latencyMode: 'quality'
    });

    const videoDecoder = new VideoDecoder({
        output: (frame) => {
            frameCount++;
            if (frameCount === 1) {
                console.log('🎥 FIRST DECODED FRAME:', {
                    format: frame.format,
                    width: frame.codedWidth,
                    height: frame.codedHeight,
                    displayWidth: frame.displayWidth,
                    displayHeight: frame.displayHeight,
                    timestamp: frame.timestamp,
                    duration: frame.duration
                });
            }
            if (frameCount <= 3 || frameCount % 500 === 0) {
                console.log(`[DECODE #${frameCount}] ${frame.codedWidth}x${frame.codedHeight} ts=${frame.timestamp}`);
            }
            try {
                // 最初のフレームは強制的にキーフレームにする
                const encodeOptions = (frameCount === 1) ? { keyFrame: true } : undefined;
                videoEncoder.encode(frame, encodeOptions);
            } catch (encErr) {
                console.error(`❌ VideoEncoder.encode() FAILED at frame #${frameCount}:`, {
                    frameSize: `${frame.codedWidth}x${frame.codedHeight}`,
                    frameFormat: frame.format,
                    error: encErr.message
                });
                throw encErr;
            }
            frame.close();
            const elapsedMs = performance.now() - start;
            const fps = frameCount / (elapsedMs / 1000);
            // FPS情報と経過時間のみ更新（stage/percentは含めない）
            onProgress({ fps, elapsedMs });
        },
        error: (e) => console.error('VideoDecoder error', e)
    });

    let audioFormatWarned = false;
    const audioDecoder = config.audio ? new AudioDecoder({
        output: (audioData) => {
            if (audioEncoder && !audioEncoderClosed && audioEncoder.state !== 'closed') {
                // Check if detected format is available and matches decoded audio
                // Only warn if there's a mismatch with the detected format
                if (!audioFormatWarned && detectedAudioFormat &&
                    (audioData.sampleRate !== detectedAudioFormat.sampleRate ||
                        audioData.numberOfChannels !== detectedAudioFormat.numberOfChannels)) {
                    console.warn('Audio format mismatch! Decoded audio:', {
                        sampleRate: audioData.sampleRate,
                        channels: audioData.numberOfChannels
                    }, 'Expected (detected):', {
                        sampleRate: detectedAudioFormat.sampleRate,
                        channels: detectedAudioFormat.numberOfChannels
                    });
                    console.warn('Audio format mismatch detected. This may indicate an issue with the format detection logic or unexpected audio stream properties.');
                    audioFormatWarned = true;
                }

                // Encode all audio data - the AudioEncoder is configured in onReady callback
                // with the detected audio format (detectedFormat.audio.sampleRate and numberOfChannels)
                audioEncoder.encode(audioData);
            }
            audioData.close();
        },
        error: (e) => console.error('AudioDecoder error', e)
    }) : null;

    // ===== SINGLE-PASS ENCODING: Format detection and encoding in one pass =====
    console.log('Starting single-pass encoding with format detection...');
    onProgress({ stage: 'demuxing', percent: 0, fps: 0, elapsedMs: 0 });

    // onReady callback: 初期化処理（Muxer, AudioEncoder）
    const onReady = async (detectedFormat) => {
        console.log('onReady callback fired with format:', detectedFormat);
        
        totalVideoDurationUs = Number(detectedFormat.video?.durationUs) || 0;
        console.log('Total video duration:', totalVideoDurationUs, 'us');

        // Store detected audio format for use in AudioDecoder output callback
        detectedAudioFormat = detectedFormat.audio;

        // 検出された実際の解像度で encoder/muxer を設定
        let actualWidth = detectedFormat.video?.width || config.video.width;
        let actualHeight = detectedFormat.video?.height || config.video.height;

        console.log('Resolution check: width=', actualWidth, 'height=', actualHeight, 'pixels=', actualWidth * actualHeight);

        // ===== VideoEncoder 再設定 =====
        console.log('\n🎬 VideoEncoder re-configuration');
        console.log(`  Input video format: ${detectedFormat.video.width}x${detectedFormat.video.height}`);
        console.log(`  Encoder will be configured as: ${actualWidth}x${actualHeight}`);
        if (detectedFormat.video.width !== actualWidth || detectedFormat.video.height !== actualHeight) {
            console.warn(`  ⚠️  RESOLUTION WILL BE CHANGED: ${detectedFormat.video.width}x${detectedFormat.video.height} → ${actualWidth}x${actualHeight}`);
        }

        // H.264 コーデックレベルの最大ピクセル数定数
        const H264_MACROBLOCK_SIZE = 16; // H.264のマクロブロックサイズ
        const AVC_LEVEL_3_1_MAX_PIXELS = 921600;    // 720p (1280x720)
        const AVC_LEVEL_4_0_MAX_PIXELS = 2097152;   // 1080p (1920x1080)
        const AVC_LEVEL_5_0_MAX_PIXELS = 8912896;   // 4K (3840x2160)

        // 解像度に応じて適切なコーデックレベルを選択
        // coded height はマクロブロックサイズの倍数に丸められるため、1080pは実際には1088になる可能性がある
        const codedArea = actualWidth * Math.ceil(actualHeight / H264_MACROBLOCK_SIZE) * H264_MACROBLOCK_SIZE;
        let selectedCodec = config.video.codec ?? 'avc1.640028';
        
        // H.264の場合、解像度に応じてレベルを自動調整
        if (selectedCodec.startsWith('avc1.')) {
            if (codedArea <= AVC_LEVEL_3_1_MAX_PIXELS) {
                // 720p以下: Level 3.1
                selectedCodec = 'avc1.4d001f';
            } else if (codedArea <= AVC_LEVEL_4_0_MAX_PIXELS) {
                // 1080p: Level 4.0
                selectedCodec = 'avc1.640028';
            } else if (codedArea <= AVC_LEVEL_5_0_MAX_PIXELS) {
                // 4K: Level 5.0
                selectedCodec = 'avc1.640032';
            } else {
                // Level 5.0を超える場合は1920x1080にダウンスケール
                console.warn(`  ⚠️  Resolution ${actualWidth}x${actualHeight} exceeds Level 5.0 limit, downscaling to 1920x1080`);
                actualWidth = 1920;
                actualHeight = 1080;
                selectedCodec = 'avc1.640028'; // Level 4.0
            }
            if (selectedCodec !== config.video.codec) {
                console.warn(`  ⚠️  Codec level adjusted: ${config.video.codec} → ${selectedCodec} (resolution: ${actualWidth}x${actualHeight}, coded area: ${codedArea})`);
            }
        }

        videoEncoder.configure({
            codec: selectedCodec,
            width: actualWidth,
            height: actualHeight,
            bitrate: config.video.bitrate,
            framerate: config.video.framerate,
            latencyMode: 'quality',
            avc: { format: 'avc' }
        });
        console.log('✅ VideoEncoder configured:', { 
            width: actualWidth, 
            height: actualHeight, 
            bitrate: config.video.bitrate,
            codec: selectedCodec,
            framerate: config.video.framerate
        });

        // ===== Muxer 初期化 =====
        console.log('Initializing Muxer...');
        const { Muxer, FileSystemWritableFileStreamTarget } = window.Mp4MuxerClasses;
        muxer = new Muxer({
            target: new FileSystemWritableFileStreamTarget(fileStream),
            video: { codec: 'avc', width: actualWidth, height: actualHeight },
            audio: detectedFormat.audio && config.audio ? {
                codec: 'aac',
                sampleRate: detectedFormat.audio.sampleRate,
                numberOfChannels: detectedFormat.audio.numberOfChannels
            } : undefined,
            fastStart: false
        }, {
            firstTimestampBehavior: 'remove'
        });
        console.log('Muxer initialized and ready for chunks');
        // Set flag AFTER muxer is fully initialized
        muxerInitialized = true;

        // ===== AudioEncoder 初期化 =====
        if (detectedFormat.audio && config.audio) {
            audioEncoder = new AudioEncoder({
                output: (chunk, meta) => {
                    audioChunkCount++;
                    if (audioChunkCount === 1) {
                        console.log('First audio chunk received, size:', chunk.byteLength);
                    }
                    const ts = Number(meta?.timestamp) || 0;
                    if (audioBaseTsUs === null) audioBaseTsUs = ts;
                    const normalizedTs = Math.max(0, ts - audioBaseTsUs);
                    // 最初のオーディオチャンクは timestamp: 0 として指定
                    const finalTs = audioChunkCount === 1 ? 0 : normalizedTs;
                    const metaAdj = { ...meta, timestamp: finalTs };
                    try {
                        muxer.addAudioChunk(chunk, metaAdj);
                        audioChunkAddedCount++;
                        if (audioChunkCount % 100 === 0) {
                            console.log(`✓ Audio chunks added: ${audioChunkAddedCount}/${audioChunkCount}`);
                        }
                    } catch (e) {
                        console.error(`✗ Failed to add audio chunk #${audioChunkCount}:`, {
                            message: e.message,
                            timestamp: ts,
                            normalizedTs: normalizedTs,
                            full_error: e.toString()
                        });
                        if (!e.message?.includes('timestamp')) {
                            throw e;
                        }
                    }
                },
                error: (e) => {
                    console.error('AudioEncoder error', e);
                    audioEncoderClosed = true;
                }
            });

            audioEncoder.configure({
                codec: config.audio.codec ?? 'mp4a.40.2',
                sampleRate: detectedFormat.audio.sampleRate,
                numberOfChannels: detectedFormat.audio.numberOfChannels,
                bitrate: config.audio.bitrate
            });
            console.log('AudioEncoder configured with detected format:', detectedFormat.audio);
        }
    };

    // 単一パスでエンコード（onReadyコールバックで初期化）
    const demuxResult = await demuxAndDecode(file, videoDecoder, audioDecoder, (pct) => {
        const percent = pct;
        onProgress({ stage: 'demuxing', percent, fps: undefined, elapsedMs: performance.now() - start });
    }, onReady);
    
    // Set expected frame count from demuxer result
    expectedFrameCount = demuxResult?.video?.sampleCount || 0;
    console.log('Expected video frames from demuxer:', expectedFrameCount);
    
    // Check if encoding is already complete or resolve immediately if no frames expected
    if (expectedFrameCount === 0 || videoChunkCount >= expectedFrameCount) {
        if (expectedFrameCount === 0) {
            console.log('No video frames expected, resolving encoding promise');
        } else {
            console.log('All chunks already encoded before check:', videoChunkCount, '/', expectedFrameCount);
        }
        encodingCompleted = true;
        encodingComplete();
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 ENCODING SUMMARY:');
    console.log(`  Frames decoded: ${frameCount}`);
    console.log(`  Video chunks encoded: ${videoChunkCount}`);
    console.log(`  Video chunks ADDED to muxer: ${videoChunkAddedCount}`);
    console.log(`  Failed/Missing: ${videoChunkCount - videoChunkAddedCount}`);
    console.log(`  Audio chunks: ${audioChunkCount} (added: ${audioChunkAddedCount})`);
    if (videoChunkAddedCount === 0) {
        console.error('\n❌ CRITICAL: NO video chunks added to muxer!');
        console.error('   Investigating causes:');
        console.error('   - Muxer initialization failed?');
        console.error('   - Resolution mismatch?');
        console.error('   - All chunks were delta frames (no key frame)?');
    }
    console.log('='.repeat(70) + '\n');

    console.log('Flushing encoders...');
    onProgress({ stage: 'encoding', percent: 100, fps: undefined, elapsedMs: performance.now() - start });
    console.log('Total frames decoded:', frameCount);
    console.log('Total video chunks encoded:', videoChunkCount);
    console.log('Total video chunks added to muxer:', videoChunkAddedCount);
    console.log('Total audio chunks encoded:', audioChunkCount);
    console.log('Total audio chunks added to muxer:', audioChunkAddedCount);

    console.log('Before encoder flush - frames decoded:', frameCount, 'chunks encoded:', videoChunkCount);
    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    console.log('After encoder flush - frames decoded:', frameCount, 'chunks encoded:', videoChunkCount);
    
    // Wait for all encoded chunks to be processed
    console.log('Waiting for all video chunks to be encoded...');
    if (expectedFrameCount > 0 && videoChunkCount < expectedFrameCount) {
        console.log(`Still waiting for chunks: ${videoChunkCount}/${expectedFrameCount}`);
        console.log(`Current state - Frames decoded: ${frameCount}, Chunks encoded: ${videoChunkCount}, Chunks added to muxer: ${videoChunkAddedCount}`);
        
        await encodingCompletePromise;
        console.log('All video chunks have been encoded');
        console.log(`Final state - Frames decoded: ${frameCount}, Chunks encoded: ${videoChunkCount}, Chunks added to muxer: ${videoChunkAddedCount}`);
    } else if (expectedFrameCount > 0) {
        console.log('All expected chunks already encoded');
    } else {
        console.warn('No expected frame count available, proceeding without waiting');
    }

    console.log('Finalizing muxer...');
    muxer.finalize();

    // Wait for muxer to flush all buffered data (including moov atom) to the stream
    // Without this delay, the fileStream.close() can happen before the muxer writes the final metadata,
    // resulting in "moov atom not found" error
    console.log('Waiting for muxer to flush buffered data...');
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('Closing file stream...');
    await fileStream.close();

    console.log('Encode complete!');
}
