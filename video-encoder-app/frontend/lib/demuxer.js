// Demuxer: mp4box を使って入力MP4を解析し、デコーダへ供給
// MP4Box はCDNからグローバル変数として読み込まれる

// ファイルのメタデータ（音声/映像フォーマット）を事前取得
export async function getFileInfo(file) {
    return new Promise((resolve, reject) => {
        console.log('getFileInfo: creating MP4Box file');
        const mp4boxfile = window.MP4Box.createFile();

        mp4boxfile.onReady = (info) => {
            console.log('getFileInfo: onReady fired', info);
            const videoTrack = info.videoTracks?.[0];
            const audioTrack = info.audioTracks?.[0];

            resolve({
                video: videoTrack ? {
                    codec: videoTrack.codec,
                    width: videoTrack.video.width,
                    height: videoTrack.video.height
                } : null,
                audio: audioTrack ? {
                    codec: audioTrack.codec,
                    sampleRate: audioTrack.audio.sample_rate,
                    numberOfChannels: audioTrack.audio.channel_count
                } : null
            });
        };

        mp4boxfile.onError = (e) => {
            console.error('getFileInfo: MP4Box error', e);
            reject(e);
        };

        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('getFileInfo: file chunk loaded, size:', e.target.result.byteLength);
            const buffer = e.target.result;
            buffer.fileStart = 0;
            mp4boxfile.appendBuffer(buffer);
            mp4boxfile.flush();
            console.log('getFileInfo: buffer appended and flushed');
        };
        reader.onerror = () => {
            console.error('getFileInfo: FileReader error');
            reject(new Error('Failed to read file'));
        };

        // タイムアウト処理（10秒）
        setTimeout(() => {
            reject(new Error('getFileInfo timeout - MP4Box onReady not fired'));
        }, 10000);

        // 最初の10MBを読んでメタデータを取得（5MBでは不足する場合がある）
        const chunkSize = Math.min(10 * 1024 * 1024, file.size);
        console.log('getFileInfo: reading chunk, size:', chunkSize);
        const blob = file.slice(0, chunkSize);
        reader.readAsArrayBuffer(blob);
    });
}

export async function demuxAndDecode(file, videoDecoder, audioDecoder, onProgress, onReady) {
    return new Promise((resolve, reject) => {
        const mp4boxfile = window.MP4Box.createFile();
        let videoTrackId = null;
        let audioTrackId = null;
        let detectedAudioFormat = null;
        let detectedVideoFormat = null;
        let lastVideoTimestampUs = 0; // 入力動画の総デュレーション算定用（マイクロ秒）
        let readyCallbackFired = false;

        mp4boxfile.onReady = async (info) => {
            const videoTrack = info.videoTracks?.[0];
            if (videoTrack) {
                videoTrackId = videoTrack.id;
                // Calculate duration from info object (in microseconds)
                // info.duration is in the movie timescale
                const durationUs = info.duration && info.timescale ? 
                    Math.round(1e6 * info.duration / info.timescale) : 0;
                detectedVideoFormat = {
                    width: videoTrack.video.width,
                    height: videoTrack.video.height,
                    durationUs: durationUs  // 動画全体の長さ（マイクロ秒）
                };
                console.log('Video format detected:', detectedVideoFormat);
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
                audioTrackId = audioTrack.id;
                detectedAudioFormat = {
                    codec: audioTrack.codec,
                    sampleRate: audioTrack.audio.sample_rate,
                    numberOfChannels: audioTrack.audio.channel_count
                };
                audioDecoder.configure(detectedAudioFormat);
                mp4boxfile.setExtractionOptions(audioTrackId, 'audio', { nbSamples: 100 });
            }

            // onReadyコールバックを呼び出し（フォーマット検出情報を渡す）
            if (onReady && !readyCallbackFired) {
                readyCallbackFired = true;
                const formatInfo = {
                    video: detectedVideoFormat,
                    audio: detectedAudioFormat
                };
                console.log('Calling onReady callback with format:', formatInfo);
                try {
                    await onReady(formatInfo);
                } catch (err) {
                    console.error('onReady callback failed:', err);
                    reject(err);
                    return;
                }
            }

            mp4boxfile.start();
        };

        mp4boxfile.onSamples = (track_id, _user, samples) => {
            if (track_id === videoTrackId) {
                for (const sample of samples) {
                    const tsUs = Math.round(1e6 * sample.cts / sample.timescale);
                    const durUs = Math.round(1e6 * sample.duration / sample.timescale);
                    // 総デュレーション算出のため、最後のタイムスタンプ+継続時間を更新
                    lastVideoTimestampUs = Math.max(lastVideoTimestampUs, tsUs + durUs);
                    // detectedVideoFormatの durationUs を実時間更新（エンコーダーで読める様に）
                    if (detectedVideoFormat) detectedVideoFormat.durationUs = lastVideoTimestampUs;
                    const chunk = new EncodedVideoChunk({
                        type: sample.is_sync ? 'key' : 'delta',
                        timestamp: tsUs,
                        duration: durUs,
                        data: sample.data
                    });
                    videoDecoder.decode(chunk);
                }
                console.log('demuxer: onSamples video, count:', samples.length, 'lastVideoTimestampUs:', lastVideoTimestampUs);
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
                console.log('demuxAndDecode: file reading completed, flushing decoders...');

                // デコーダーのキューをflushして、すべてのフレームがデコードされるまで待つ
                Promise.all([
                    videoDecoder.flush(),
                    audioDecoder ? audioDecoder.flush() : Promise.resolve()
                ]).then(() => {
                    console.log('demuxAndDecode: decoders flushed, resolving promise');
                    resolve({
                        video: detectedVideoFormat ? { ...detectedVideoFormat, durationUs: lastVideoTimestampUs } : null,
                        audio: detectedAudioFormat
                    });
                }).catch(reject);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));

        function readNextChunk() {
            const blob = file.slice(offset, offset + chunkSize);
            reader.readAsArrayBuffer(blob);
        }

        readNextChunk();
    });
}

function generateDescriptionBuffer(entry) {
    if (entry.avcC) {
        const stream = new window.DataStream(undefined, 0, window.DataStream.BIG_ENDIAN);
        entry.avcC.write(stream);
        return new Uint8Array(stream.buffer, 8);
    } else if (entry.hvcC) {
        const stream = new window.DataStream(undefined, 0, window.DataStream.BIG_ENDIAN);
        entry.hvcC.write(stream);
        return new Uint8Array(stream.buffer, 8);
    }
    return null;
}
