// Encoder: WebCodecs で再エンコードし、mp4-muxer で FileSystem へ保存
// Muxer と FileSystemWritableFileStreamTarget は index.html で window.Mp4MuxerClasses に設定される

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
    let audioChunkCount = 0;
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
                console.log('First video chunk received, size:', chunk.byteLength);
            }
            if (muxer) {
                const ts = Number(meta?.timestamp) || 0;
                if (videoBaseTsUs === null) videoBaseTsUs = ts;
                const normalizedTs = Math.max(0, ts - videoBaseTsUs);
                const metaAdj = { ...meta, timestamp: normalizedTs };
                muxer.addVideoChunk(chunk, metaAdj);
            }
            // エンコード進捗（80%→90%）を、エンコード済みのタイムスタンプで推定
            if (totalVideoDurationUs > 0 && meta) {
                const tsRaw = Number(meta.timestamp) || 0;
                const dur = Number(meta.duration) || 0;
                const base = videoBaseTsUs ?? tsRaw;
                const tsNorm = Math.max(0, tsRaw - base);
                encodedVideoUs = Math.max(encodedVideoUs, tsNorm + dur);
                const encPct = 80 + Math.min(10, 10 * (encodedVideoUs / totalVideoDurationUs));
                onProgress(encPct);
            }
        },
        error: (e) => console.error('VideoEncoder error', e)
    });

    // VideoEncoderは仮の設定で初期化（後で再設定）
    videoEncoder.configure({
        codec: config.video.codec ?? 'avc1.42001f',
        width: config.video.width,
        height: config.video.height,
        bitrate: config.video.bitrate,
        framerate: config.video.framerate,
        latencyMode: 'quality'
    });

    const videoDecoder = new VideoDecoder({
        output: (frame) => {
            frameCount++;
            videoEncoder.encode(frame);
            frame.close();
            const elapsedMs = performance.now() - start;
            const fps = frameCount / (elapsedMs / 1000);
            onProgress(undefined, { fps, elapsedMs });
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

    // demuxAndDecodeを実行して実際のフォーマットを取得
    // ファイル読み込みを0-80%として表示
    const detectedFormat = await demuxAndDecode(file, videoDecoder, audioDecoder, (pct) => {
        const adjustedPct = pct * 0.8; // 読み込み・デマックス進捗を0-80%に割当
        onProgress(adjustedPct);
    });
    console.log('Detected format:', detectedFormat);

    // エンコード段階に移行（80%起点）
    onProgress(80);
    totalVideoDurationUs = Number(detectedFormat.video?.durationUs) || 0;

    // 検出された実際の解像度でVideoEncoderを再設定
    const actualWidth = detectedFormat.video?.width || config.video.width;
    const actualHeight = detectedFormat.video?.height || config.video.height;

    videoEncoder.configure({
        codec: config.video.codec ?? 'avc1.42001f',
        width: actualWidth,
        height: actualHeight,
        bitrate: config.video.bitrate,
        framerate: config.video.framerate,
        latencyMode: 'quality'
    });
    console.log('VideoEncoder reconfigured with actual resolution:', { width: actualWidth, height: actualHeight });

    // 実際の解像度でMuxerを初期化
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
        // 入力フレーム/音声の最初のタイムスタンプが0でない場合は自動的にゼロ起点へオフセット
        firstTimestampBehavior: 'offset'
    });
    console.log('Muxer initialized with detected format');

    // AudioEncoderを検出されたフォーマットで初期化
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
                const metaAdj = { ...meta, timestamp: normalizedTs };
                muxer.addAudioChunk(chunk, metaAdj);
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

    console.log('Flushing encoders...');
    onProgress(90); // エンコード進捗の上限に達した後、Flush開始を90%で表示
    console.log('Total frames decoded:', frameCount);
    console.log('Total video chunks:', videoChunkCount);
    console.log('Total audio chunks:', audioChunkCount);

    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    onProgress(95); // Flush完了

    console.log('Finalizing muxer...');
    muxer.finalize();
    onProgress(98); // Finalize完了

    console.log('Closing file stream...');
    await fileStream.close();
    onProgress(100); // 完全完了

    console.log('Encode complete!');
}
