/**
 * メインアプリケーション
 * UI制御とイベントハンドリング
 */

import { fetchPresets, fetchPosts, createPost, escapeHtml, formatDate, formatFileSize } from './api-client.js';
import { CustomVideoEncoder, checkBrowserSupport } from './video-encoder.js';

// グローバル変数
let selectedFile = null;
let encodedBlob = null;
let benchmarkResult = null;
let currentConfig = null;
let videoEncoder = null;

/**
 * DOMContentLoaded イベント
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('アプリケーション初期化中...');

    // ブラウザサポートチェック
    const support = checkBrowserSupport();
    if (!support.webCodecsSupported) {
        alert('お使いのブラウザはWebCodecs APIをサポートしていません。Chrome 94以降をご利用ください。');
        return;
    }

    // 初期化
    await initializeApp();
    setupEventListeners();

    // 初期設定を読み込み
    updateConfig();

    console.log('アプリケーション初期化完了');
});

/**
 * アプリケーションの初期化
 */
async function initializeApp() {
    try {
        // プリセットを読み込み
        await loadPresets();

        // ベンチマーク一覧を読み込み
        await loadBenchmarks();
    } catch (error) {
        console.error('初期化エラー:', error);
        alert('アプリケーションの初期化に失敗しました: ' + error.message);
    }
}

/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
    // ファイル選択
    document.getElementById('videoFile').addEventListener('change', handleFileSelect);

    // プリセット選択
    document.getElementById('presetSelect').addEventListener('change', handlePresetSelect);

    // 設定変更
    ['codecSelect', 'widthInput', 'heightInput', 'bitrateInput', 'fpsInput'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateConfig);
    });

    // エンコード開始
    document.getElementById('startEncode').addEventListener('click', handleEncode);

    // ダウンロードボタン
    document.getElementById('downloadBtn').addEventListener('click', handleDownload);

    // ベンチマーク投稿
    document.getElementById('benchmarkForm').addEventListener('submit', handleBenchmarkSubmit);

    // ベンチマーク更新
    document.getElementById('refreshBtn').addEventListener('click', loadBenchmarks);
    document.getElementById('limitSelect').addEventListener('change', loadBenchmarks);
}

/**
 * プリセットを読み込み
 */
async function loadPresets() {
    try {
        const presets = await fetchPresets();
        const select = document.getElementById('presetSelect');

        // デフォルトオプションをクリア
        select.innerHTML = '<option value="">カスタム設定</option>';

        // プリセットを追加
        presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = escapeHtml(preset.name);
            option.dataset.config = preset.config_json;
            select.appendChild(option);
        });

        console.log(`${presets.length}個のプリセットを読み込みました`);
    } catch (error) {
        console.error('プリセット読み込みエラー:', error);
    }
}

/**
 * ファイル選択処理
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    selectedFile = file;

    // ファイル名を表示
    document.getElementById('fileLabel').textContent = file.name;

    // プレビュー表示
    const preview = document.getElementById('videoPreview');
    const video = document.getElementById('previewVideo');
    const videoUrl = URL.createObjectURL(file);

    video.src = videoUrl;
    preview.classList.remove('hidden');

    // ファイル情報を表示
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);

    video.onloadedmetadata = () => {
        const duration = Math.floor(video.duration);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        document.getElementById('videoDuration').textContent =
            `${minutes}分${seconds}秒`;

        // エンコードボタンを有効化
        document.getElementById('startEncode').disabled = false;
    };
}

/**
 * プリセット選択処理
 */
function handlePresetSelect(event) {
    const select = event.target;
    const option = select.options[select.selectedIndex];

    if (!option.dataset.config) return;

    try {
        const config = JSON.parse(option.dataset.config);

        // UI に設定を反映
        if (config.codec) document.getElementById('codecSelect').value = config.codec;
        if (config.resolution) {
            const [width, height] = config.resolution.split('x');
            document.getElementById('widthInput').value = width;
            document.getElementById('heightInput').value = height;
        }
        if (config.bitrate) {
            document.getElementById('bitrateInput').value = parseInt(config.bitrate);
        }
        if (config.fps) {
            document.getElementById('fpsInput').value = config.fps;
        }

        updateConfig();
    } catch (error) {
        console.error('プリセット適用エラー:', error);
    }
}

/**
 * 現在の設定を更新
 */
function updateConfig() {
    currentConfig = {
        codec: document.getElementById('codecSelect').value,
        width: parseInt(document.getElementById('widthInput').value),
        height: parseInt(document.getElementById('heightInput').value),
        bitrate: parseInt(document.getElementById('bitrateInput').value),
        fps: parseInt(document.getElementById('fpsInput').value),
    };

    console.log('設定更新:', currentConfig);
}

/**
 * エンコード処理
 */
async function handleEncode() {
    if (!selectedFile) {
        alert('動画ファイルを選択してください');
        return;
    }

    updateConfig();

    // 設定の妥当性チェック
    if (!currentConfig || !currentConfig.codec) {
        alert('エンコード設定が正しくありません');
        console.error('Invalid config:', currentConfig);
        return;
    }

    const startBtn = document.getElementById('startEncode');
    const progressContainer = document.getElementById('progressContainer');
    const resultContainer = document.getElementById('resultContainer');

    // UI更新
    startBtn.disabled = true;
    document.getElementById('encodeButtonText').textContent = 'エンコード中...';
    progressContainer.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    try {
        // エンコーダー初期化
        videoEncoder = new CustomVideoEncoder();
        await videoEncoder.initialize(currentConfig, updateProgress);

        // エンコード実行
        encodedBlob = await videoEncoder.encodeVideo(selectedFile);

        // 結果取得
        benchmarkResult = videoEncoder.getResult();

        // 結果表示
        displayResult(benchmarkResult, encodedBlob.size);

        // ベンチマーク投稿ボタンを有効化
        document.getElementById('submitBenchmark').disabled = false;

    } catch (error) {
        console.error('エンコードエラー:', error);
        alert('エンコードに失敗しました: ' + error.message);
    } finally {
        startBtn.disabled = false;
        document.getElementById('encodeButtonText').textContent = 'エンコード開始';

        if (videoEncoder) {
            videoEncoder.cleanup();
        }
    }
}

/**
 * 進捗更新
 */
function updateProgress(data) {
    document.getElementById('progressBar').style.width = data.progress + '%';
    document.getElementById('progressPercent').textContent = data.progress.toFixed(1) + '%';
    document.getElementById('progressStatus').textContent =
        `フレーム ${data.frameCount} / ${data.totalFrames}`;
    document.getElementById('encodeTime').textContent =
        `経過時間: ${data.elapsed}秒`;
    document.getElementById('encodeFps').textContent =
        `速度: ${data.fps} fps`;
}

/**
 * 結果表示
 */
function displayResult(result, fileSize) {
    const resultContainer = document.getElementById('resultContainer');
    resultContainer.classList.remove('hidden');

    document.getElementById('resultTime').textContent = result.encode_time;
    document.getElementById('resultFps').textContent = result.fps;
    document.getElementById('resultSize').textContent = formatFileSize(fileSize);
}

/**
 * ダウンロード処理
 */
function handleDownload() {
    if (!encodedBlob) {
        alert('エンコードされた動画がありません');
        return;
    }

    const url = URL.createObjectURL(encodedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'encoded_' + Date.now() + '.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * ベンチマーク投稿処理
 */
async function handleBenchmarkSubmit(event) {
    event.preventDefault();

    if (!benchmarkResult || !currentConfig) {
        alert('先にエンコードを実行してください');
        return;
    }

    const userName = document.getElementById('userName').value.trim();
    const comment = document.getElementById('userComment').value.trim();

    if (!userName) {
        alert('ユーザー名を入力してください');
        return;
    }

    const submitBtn = document.getElementById('submitBenchmark');
    submitBtn.disabled = true;
    submitBtn.textContent = '投稿中...';

    try {
        const postData = {
            user_name: userName,
            comment: comment,
            config_json: {
                codec: currentConfig.codec,
                resolution: `${currentConfig.width}x${currentConfig.height}`,
                bitrate: currentConfig.bitrate + 'k',
                fps: currentConfig.fps
            },
            benchmark_result: {
                encode_time: parseFloat(benchmarkResult.encode_time),
                fps: parseFloat(benchmarkResult.fps),
                frame_count: benchmarkResult.frame_count
            }
        };

        await createPost(postData);

        alert('ベンチマーク結果を投稿しました！');

        // フォームをリセット
        document.getElementById('benchmarkForm').reset();

        // 一覧を更新
        await loadBenchmarks();

    } catch (error) {
        console.error('投稿エラー:', error);
        alert('投稿に失敗しました: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '投稿する';
    }
}

/**
 * ベンチマーク一覧を読み込み
 */
async function loadBenchmarks() {
    const limit = parseInt(document.getElementById('limitSelect').value);
    const listContainer = document.getElementById('benchmarkList');

    listContainer.innerHTML = '<p class="loading">読み込み中...</p>';

    try {
        const posts = await fetchPosts(limit);

        if (posts.length === 0) {
            listContainer.innerHTML = '<p class="loading">投稿がありません</p>';
            return;
        }

        listContainer.innerHTML = '';

        posts.forEach(post => {
            const item = createBenchmarkItem(post);
            listContainer.appendChild(item);
        });

        console.log(`${posts.length}件のベンチマークを読み込みました`);
    } catch (error) {
        console.error('ベンチマーク読み込みエラー:', error);
        listContainer.innerHTML = '<p class="loading">読み込みに失敗しました</p>';
    }
}

/**
 * ベンチマークアイテムを作成
 */
function createBenchmarkItem(post) {
    const div = document.createElement('div');
    div.className = 'benchmark-item';

    const config = JSON.parse(post.config_json);
    const result = JSON.parse(post.benchmark_result);

    div.innerHTML = `
        <div class="benchmark-header">
            <span class="benchmark-user">${escapeHtml(post.user_name)}</span>
            <span class="benchmark-date">${formatDate(post.created_at)}</span>
        </div>
        ${post.comment ? `<p class="benchmark-comment">"${escapeHtml(post.comment)}"</p>` : ''}
        <div class="benchmark-config">
            <span><strong>コーデック:</strong> ${escapeHtml(config.codec || 'N/A')}</span>
            <span><strong>解像度:</strong> ${escapeHtml(config.resolution || 'N/A')}</span>
            <span><strong>ビットレート:</strong> ${escapeHtml(config.bitrate || 'N/A')}</span>
            <span><strong>FPS:</strong> ${escapeHtml(String(config.fps || 'N/A'))}</span>
        </div>
        <div class="benchmark-result">
            <strong>⚡ エンコード時間: ${result.encode_time}秒 | 速度: ${result.fps} fps</strong>
        </div>
    `;

    return div;
}
