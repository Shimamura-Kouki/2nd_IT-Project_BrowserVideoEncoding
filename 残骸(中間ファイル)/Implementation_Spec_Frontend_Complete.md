# フロントエンド実装完全ガイド：ブラウザ完結型 動画エンコードアプリ

バージョン: 2.0 (Fix)

対象: フロントエンドエンジニア (Svelte/WebCodecs)

目的: 本書のみで動画エンコード機能（映像・音声・保存）およびAPI連携を実装可能にする。

## 1. プロジェクト概要と制約

* **アーキテクチャ:** サーバーレス動画処理（Client-Side Processing）。バックエンドはJSON APIとしてのみ利用する。
* **絶対要件:** 動画データのサーバー送信禁止。全てのエンコード処理はブラウザ内（WebCodecs API）で完結させること。

## 2. 技術スタックとライブラリ選定

* **Framework:** Svelte 4.x or 5.x
* **Language:** TypeScript / JavaScript
* **Video/Audio Logic:** WebCodecs API (Native)
* **File System:** FileSystem Access API (Native)
* **Muxing (重要):** `mp4-muxer`
  * ※理由: `mp4box.js` はストリーム書き込みの実装難易度が高いため、FileSystem APIと親和性の高い `mp4-muxer` を採用する。

## 3. 実装詳細：動画処理コア (The Core)

`src/lib/core/` 配下に配置するエンコードエンジンの実装仕様。

### 3.1 映像と音声の並列パイプライン

**欠落しがちな「音声処理」を必ず実装すること。** 無音動画を防ぐため、以下の構成を厳守する。

#### A. ライブラリ初期化と保存先確保

```
import { Muxer, FileSystemWritableFileStreamTarget } from 'mp4-muxer';

// 1. 保存先の確保（ユーザー対話）
const handle = await window.showSaveFilePicker({
  suggestedName: 'output.mp4',
  types: [{ description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } }],
});
const writable = await handle.createWritable();

// 2. Muxer初期化（映像・音声トラック定義）
const muxer = new Muxer({
  target: new FileSystemWritableFileStreamTarget(writable),
  video: {
    codec: 'avc', // H.264 (avc1)
    width: 1920,
    height: 1080
  },
  audio: {
    codec: 'aac', // AAC
    sampleRate: 44100,
    numberOfChannels: 2
  },
  fastStart: false // ストリーム書き込み優先のため false (moov atomを末尾に配置)
});

```

#### B. 映像パイプライン (Video Pipeline)

`VideoDecoder` で取得した `VideoFrame` を `VideoEncoder` にパスする。

```
// Encoder: 圧縮してMuxerへ
const videoEncoder = new VideoEncoder({
  output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  error: (e) => console.error(e)
});
videoEncoder.configure({
  codec: 'avc1.4d002a', // Main Profile Level 4.2
  width: 1920,
  height: 1080,
  bitrate: 5_000_000, // 5Mbps
  framerate: 30
});

// Decoder: 映像フレームを取り出す
const videoDecoder = new VideoDecoder({
  output: (frame) => {
    // プレビュー用にCanvasへ描画する処理をここに挟む
    drawPreview(frame); 
  
    // エンコード
    videoEncoder.encode(frame);
    frame.close(); // 重要: メモリリーク防止
  },
  error: (e) => console.error(e)
});

```

#### C. 音声パイプライン (Audio Pipeline) ★必須

これがないと動画は無音になる。

```
// Encoder: AACに圧縮してMuxerへ
const audioEncoder = new AudioEncoder({
  output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
  error: (e) => console.error(e)
});
audioEncoder.configure({
  codec: 'mp4a.40.2', // AAC-LC
  sampleRate: 44100,
  numberOfChannels: 2,
  bitrate: 128_000
});

// Decoder: 音声データ(PCM)を取り出す
const audioDecoder = new AudioDecoder({
  output: (audioData) => {
    audioEncoder.encode(audioData);
    audioData.close();
  },
  error: (e) => console.error(e)
});

```

#### D. Demuxing (読み込み)

入力ファイルの解析には mp4box.js を使用する（Demux機能のみ利用）。

onSamples イベントでトラックIDを判別し、videoDecoder と audioDecoder にそれぞれデータを振り分ける。

## 4. API連携仕様 (Client Side)

バックエンド（PHP）とはREST APIでのみ通信する。`src/lib/api/client.js` 等に実装。

### 4.1 エンドポイント一覧

| **目的**     | **メソッド** | **URLパス**             | **リクエスト** | **レスポンス例**                        |
| ------------------ | ------------------ | ----------------------------- | -------------------- | --------------------------------------------- |
| **設定取得** | GET                | `/api/?action=preset_index` | なし                 | `[{id:1, name:"1080p", config_json:{...}}]` |
| **投稿一覧** | GET                | `/api/?action=post_index`   | `limit=10`         | `[{id:1, user_name:"A", ...}]`              |
| **結果共有** | POST               | `/api/?action=post_store`   | JSON Body            | `{"message": "Created", "id": 123}`         |

### 4.2 投稿データ構造 (POST Body)

エンコード完了後、ユーザーが共有ボタンを押した際に送信するJSON。

```
{
  "user_name": "ユーザー名",
  "comment": "任意コメント",
  "config_json": {
    "codec": "avc1.4d002a",
    "width": 1920,
    "height": 1080,
    "bitrate": 5000000
  },
  "benchmark_result": {
    "encode_time_sec": 45.5,
    "avg_fps": 120.5
  },
  "user_agent": "Mozilla/5.0..."
}

```

## 5. UI実装の注意点

1. **プログレス表示:** `mp4box` の解析進行度と、WebCodecsのエンコード進行度を視覚化すること。
2. **プレビュー:** 全フレームを描画すると重いため、`requestAnimationFrame` 等で間引いてCanvasに描画すること。
3. **ナレッジベース:** APIから取得した他人の `config_json` を、自分のエンコード設定に適用（コピー）するボタンを作成すること。
