// Encoder: WebCodecs で再エンコードし、mp4-muxer で FileSystem へ保存
// Muxer と FileSystemWritableFileStreamTarget は index.html で window.Mp4MuxerClasses に設定される

// onProgress の呼び出し形式: onProgress({ stage, percent, fps, elapsedMs })
// stage: 'reading', 'encoding', 'flushing', 'finalizing'

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
            if (muxer) {
                // ⚠️ mp4-muxerは「ミリ秒」単位のタイムスタンプを期待（マイクロ秒ではない）
                const tsUs = Number(chunk.timestamp) || 0;
                const durUs = Number(chunk.duration) || 0;

                if (videoBaseTsUs === null) {
                    videoBaseTsUs = tsUs;
                    console.log('videoBaseTsUs initialized:', videoBaseTsUs);
                }
                const normalizedTsUs = Math.max(0, tsUs - videoBaseTsUs);

                try {
                    // マイクロ秒 → ミリ秒に変換（mp4-muxer要件）
                    const finalTsMs = normalizedTsUs / 1000;
                    const durationMs = durUs / 1000;

                    if (videoChunkCount <= 3 || videoChunkCount % 500 === 0) {
                        console.log(`[CHUNK ${videoChunkCount}] ts: ${finalTsMs.toFixed(2)}ms, dur: ${durationMs.toFixed(2)}ms, type: ${chunk.type}`);
                    }

                    // addVideoChunkRaw()を使用してtimestampとduration両方をミリ秒で渡す
                    const data = new Uint8Array(chunk.byteLength);
                    chunk.copyTo(data);
                    muxer.addVideoChunkRaw(data, chunk.type, finalTsMs, durationMs, meta);

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
        },
        error: (e) => console.error('VideoEncoder error', e)
    });

    // VideoEncoderは仮の設定で初期化（後で再設定）
    // codec: Level 5.0 (avc1.640028) で1920x1200をサポート
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
            // FPS情報と経過時間のみ更新（stage/percentは保持）
            onProgress({ stage: undefined, percent: undefined, fps, elapsedMs });
        },
        error: (e) => console.error('VideoDecoder error', e)
    });

    let audioFormatWarned = false;
    const audioDecoder = config.audio ? new AudioDecoder({
        output: (audioData) => {
            if (audioEncoder && !audioEncoderClosed && audioEncoder.state !== 'closed') {
                // フォーマット不一致の警告（初回のみ）
                if (!audioFormatWarned &&
                    (audioData.sampleRate !== config.audio.sampleRate ||
                        audioData.numberOfChannels !== config.audio.numberOfChannels)) {
                    console.warn('Audio format mismatch! Input:', {
                        sampleRate: audioData.sampleRate,
                        channels: audioData.numberOfChannels
                    }, 'Expected:', {
                        sampleRate: config.audio.sampleRate,
                        channels: config.audio.numberOfChannels
                    });
                    console.warn('Audio will be skipped. Please select a preset matching your input file.');
                    audioFormatWarned = true;
                }

                // フォーマットが一致する場合のみエンコード
                if (audioData.sampleRate === config.audio.sampleRate &&
                    audioData.numberOfChannels === config.audio.numberOfChannels) {
                    audioEncoder.encode(audioData);
                }
            }
            audioData.close();
        },
        error: (e) => console.error('AudioDecoder error', e)
    }) : null;

    // ===== STEP 1: ファイル形式を先に検出（Muxer 初期化前）=====
    console.log('STEP 1: Detecting format...');
    const detectedFormat = await demuxAndDecode(file, videoDecoder, audioDecoder, (pct) => {
        const percent = pct; // 0-100%
        onProgress({ stage: 'reading', percent, fps: undefined, elapsedMs: performance.now() - start });
    });
    console.log('Detected format:', detectedFormat);

    // エンコード段階に移行
    onProgress({ stage: 'encoding', percent: 0, fps: 0, elapsedMs: performance.now() - start });
    totalVideoDurationUs = Number(detectedFormat.video?.durationUs) || 0;
    console.log('Encoding stage started. Total duration:', totalVideoDurationUs, 'us');

    // 検出された実際の解像度で encoder/muxer を設定
    let actualWidth = detectedFormat.video?.width || config.video.width;
    let actualHeight = detectedFormat.video?.height || config.video.height;

    console.log('Resolution check: width=', actualWidth, 'height=', actualHeight, 'pixels=', actualWidth * actualHeight);

    // AVC Level 5.0制限: 最大2228224ピクセル
    const maxPixels = 2228224;
    if (actualWidth * actualHeight > maxPixels) {
        console.log('Resolution exceeds AVC Level 5.0 limit, normalizing to 1920x1080');
        actualWidth = 1920;
        actualHeight = 1080;
    }

    // ===== STEP 2: VideoEncoder 再設定 =====
    console.log('\n🎬 STEP 2: VideoEncoder configuration');
    console.log(`  Input video format: ${detectedFormat.video.width}x${detectedFormat.video.height}`);
    console.log(`  Encoder will be configured as: ${actualWidth}x${actualHeight}`);
    if (detectedFormat.video.width !== actualWidth || detectedFormat.video.height !== actualHeight) {
        console.warn(`  ⚠️  RESOLUTION WILL BE CHANGED: ${detectedFormat.video.width}x${detectedFormat.video.height} → ${actualWidth}x${actualHeight}`);
    }

    // 1回目のエンコードキューをクリア
    await videoEncoder.flush();
    console.log('✅ VideoEncoder flushed (1st pass queue cleared)');

    videoEncoder.configure({
        codec: config.video.codec ?? 'avc1.640028',
        width: actualWidth,
        height: actualHeight,
        bitrate: config.video.bitrate,
        framerate: config.video.framerate,
        latencyMode: 'quality',
        avc: { format: 'avc' }
    });
    console.log('✅ VideoEncoder configured:', { width: actualWidth, height: actualHeight });

    // ===== STEP 3: Muxer 初期化（エンコード開始前に必須）=====
    console.log('STEP 3: Initializing Muxer BEFORE encoding starts...');
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
    console.log('Muxer initialized, ready for encoding');

    // ===== STEP 4: AudioEncoder 初期化 =====
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

    // ===== STEP 5: 実際にエンコーディング実行（フォーマット検出済み、Muxer 初期化済み）=====
    console.log('STEP 5: Starting actual encoding with muxer initialized...');

    // ⚠️ 重要：2回目のエンコード前にカウンターをリセット
    frameCount = 0;
    videoChunkCount = 0;
    audioChunkCount = 0;
    videoChunkAddedCount = 0;
    audioChunkAddedCount = 0;
    videoBaseTsUs = null;
    audioBaseTsUs = null;
    console.log('✅ Counters reset for second encoding pass');

    await demuxAndDecode(file, videoDecoder, audioDecoder, (pct) => {
        // Don't report demuxing progress during encoding pass - it overrides real encoding progress
        // The actual encoding progress is reported by videoEncoder.output callback
    });

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
        console.error('   - Resolution mismatch? (input: 1920x1200 vs muxer: 1920x1080?)');
        console.error('   - All chunks were delta frames (no key frame)?');
    }
    console.log('='.repeat(70) + '\n');

    console.log('Flushing encoders...');
    onProgress({ stage: 'flushing', percent: 0, fps: undefined, elapsedMs: performance.now() - start });
    console.log('Total frames decoded:', frameCount);
    console.log('Total video chunks encoded:', videoChunkCount);
    console.log('Total video chunks added to muxer:', videoChunkAddedCount);
    console.log('Total audio chunks encoded:', audioChunkCount);
    console.log('Total audio chunks added to muxer:', audioChunkAddedCount);

    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    onProgress({ stage: 'flushing', percent: 50, fps: undefined, elapsedMs: performance.now() - start });

    console.log('Finalizing muxer...');
    muxer.finalize();
    onProgress({ stage: 'finalizing', percent: 50, fps: undefined, elapsedMs: performance.now() - start });

    console.log('Closing file stream...');
    await fileStream.close();
    onProgress({ stage: 'finalizing', percent: 100, fps: undefined, elapsedMs: performance.now() - start });

    console.log('Encode complete!');
}
