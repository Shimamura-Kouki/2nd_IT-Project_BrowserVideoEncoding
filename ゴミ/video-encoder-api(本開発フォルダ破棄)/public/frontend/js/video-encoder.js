/**
 * 動画エンコーダー
 * WebCodecs API を使用した動画エンコード処理
 */

/**
 * 動画エンコーダークラス
 */
export class CustomVideoEncoder {
    constructor() {
        this.encoder = null;
        this.muxer = null;
        this.muxedData = [];
        this.frameCount = 0;
        this.startTime = 0;
        this.config = null;
        this.progressCallback = null;
        this.totalFrames = 0;
    }

    /**
     * WebCodecs API がサポートされているかチェック
     * @returns {boolean}
     */
    static isSupported() {
        return 'VideoEncoder' in window &&
            'VideoDecoder' in window &&
            'VideoFrame' in window;
    }

    /**
     * エンコーダーを初期化
     * @param {Object} config - エンコード設定
     * @param {Function} progressCallback - 進捗コールバック
     */
    async initialize(config, progressCallback) {
        if (!CustomVideoEncoder.isSupported()) {
            throw new Error('WebCodecs APIがサポートされていません');
        }

        this.config = config;
        this.progressCallback = progressCallback;
        this.muxedData = [];
        this.frameCount = 0;

        // 設定のバリデーション
        if (!config.codec || !config.width || !config.height || !config.bitrate || !config.fps) {
            throw new Error('エンコード設定が不完全です: ' + JSON.stringify(config));
        }

        // エンコーダー設定の検証
        const encoderConfig = {
            codec: config.codec,
            width: config.width,
            height: config.height,
            bitrate: config.bitrate * 1000, // kbps to bps
            framerate: config.fps,
            latencyMode: 'quality',
        };

        console.log('エンコーダー設定:', encoderConfig);

        const support = await window.VideoEncoder.isConfigSupported(encoderConfig);
        if (!support.supported) {
            throw new Error('指定されたエンコード設定はサポートされていません');
        }

        // Muxerの初期化
        this.muxer = new Mp4Muxer.Muxer({
            target: new Mp4Muxer.ArrayBufferTarget(),
            video: {
                codec: config.codec.startsWith('avc') ? 'avc' : config.codec.startsWith('vp') ? 'vp9' : 'av1',
                width: config.width,
                height: config.height,
            },
            fastStart: 'in-memory',
        });

        // エンコーダーの作成
        this.encoder = new window.VideoEncoder({
            output: (chunk, metadata) => {
                // Muxerにチャンクを追加
                this.muxer.addVideoChunk(chunk, metadata);
            },
            error: (error) => {
                console.error('エンコードエラー:', error);
                throw error;
            }
        });

        this.encoder.configure(encoderConfig);
    }

    /**
     * 動画ファイルをエンコード
     * @param {File} videoFile - 動画ファイル
     * @returns {Promise<Blob>} エンコードされた動画データ
     */
    async encodeVideo(videoFile) {
        this.startTime = performance.now();

        // 動画要素を作成して読み込み
        const video = document.createElement('video');
        video.src = URL.createObjectURL(videoFile);
        video.muted = true;

        await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = reject;
        });

        // 総フレーム数を計算
        this.totalFrames = Math.floor(video.duration * this.config.fps);

        // Canvas for frame extraction
        const canvas = document.createElement('canvas');
        canvas.width = this.config.width;
        canvas.height = this.config.height;
        const ctx = canvas.getContext('2d');

        // フレームごとに処理
        const frameDuration = 1000000 / this.config.fps; // マイクロ秒
        let currentTime = 0;

        for (let i = 0; i < this.totalFrames; i++) {
            video.currentTime = i / this.config.fps;

            await new Promise(resolve => {
                video.onseeked = resolve;
            });

            // Canvasに描画
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // VideoFrameを作成（canvasから直接作成）
            const frame = new VideoFrame(canvas, {
                timestamp: currentTime,
                duration: frameDuration
            });

            // エンコード
            this.encoder.encode(frame, { keyFrame: i % 30 === 0 });
            frame.close();

            this.frameCount++;
            currentTime += frameDuration;

            // 進捗通知
            if (this.progressCallback) {
                const elapsed = (performance.now() - this.startTime) / 1000;
                const fps = this.frameCount / elapsed;
                const progress = (this.frameCount / this.totalFrames) * 100;

                this.progressCallback({
                    progress: progress,
                    frameCount: this.frameCount,
                    totalFrames: this.totalFrames,
                    fps: fps.toFixed(2),
                    elapsed: elapsed.toFixed(1)
                });
            }

            // ブラウザがフリーズしないように少し待機
            if (i % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        // エンコード完了を待つ
        await this.encoder.flush();

        // Muxerをfinalize
        this.muxer.finalize();

        // クリーンアップ
        URL.revokeObjectURL(video.src);

        // MP4/WebM形式で出力
        return this.createVideoBlob();
    }

    /**
     * Muxerから動画Blobを作成
     * @returns {Blob}
     */
    createVideoBlob() {
        const buffer = this.muxer.target.buffer;
        return new Blob([buffer], { type: 'video/mp4' });
    }

    /**
     * エンコード結果を取得
     * @returns {Object}
     */
    getResult() {
        const elapsed = (performance.now() - this.startTime) / 1000;
        const avgFps = this.frameCount / elapsed;

        return {
            encode_time: elapsed.toFixed(2),
            fps: avgFps.toFixed(2),
            frame_count: this.frameCount,
            output_size: this.muxer ? this.muxer.target.buffer.byteLength : 0
        };
    }

    /**
     * リソースをクリーンアップ
     */
    cleanup() {
        if (this.encoder && this.encoder.state !== 'closed') {
            this.encoder.close();
        }
        this.muxer = null;
        this.muxedData = [];
        this.frameCount = 0;
    }
}

/**
 * ブラウザ互換性チェック
 * @returns {Object} サポート情報
 */
export function checkBrowserSupport() {
    return {
        webCodecsSupported: CustomVideoEncoder.isSupported(),
        fileApiSupported: 'File' in window && 'FileReader' in window,
        blobSupported: 'Blob' in window,
        canvasSupported: !!document.createElement('canvas').getContext,
    };
}
