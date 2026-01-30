
# フロントエンド実装完全ガイド：ブラウザ完結型 動画エンコードアプリ

バージョン: 3.0 (Final)

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
* **Demuxing (解析):** `mp4box.js`
  * ※理由: 入力MP4の解析とトラック分離に利用。

## 3. 実装詳細：動画処理コア (The Core)

`src/lib/core/` 配下に配置するエンコードエンジンの実装仕様。

### 3.1 映像と音声の並列パイプライン

**欠落しがちな「音声処理」を必ず実装すること。** 無音動画を防ぐため、VideoとAudioの2つのパイプラインを並行稼働させる。

**全体フロー:**

1. **Source File** -> **Demuxer (mp4box)** -> (Encoded Chunk)
2. (Encoded Chunk) -> **Decoder** -> (Raw Frame / AudioData)
3. (Raw Frame) -> **Encoder** -> (New Encoded Chunk)
4. (New Encoded Chunk) -> **Muxer (mp4-muxer)** -> **FileSystem Writable Stream**

#### A. Muxerの初期化とファイル保存

メモリ枯渇を防ぐため、`FileSystemWritableFileStreamTarget` を使用し、ディスクへ直接ストリーミング書き込みを行う。

```
import { Muxer, FileSystemWritableFileStreamTarget } from 'mp4-muxer';

// ユーザーに保存先を選択させる
const handle = await window.showSaveFilePicker({
  suggestedName: 'output.mp4',
  types: [{ description: 'Video File', accept: { 'video/mp4': ['.mp4'] } }],
});

const fileStream = await handle.createWritable();

// Muxerの初期化 (映像・音声両対応)
const muxer = new Muxer({
  target: new FileSystemWritableFileStreamTarget(fileStream),
  video: {
    codec: 'avc', // H.264
    width: 1920,
    height: 1080
  },
  audio: {
    codec: 'aac',
    sampleRate: 44100,
    numberOfChannels: 2
  },
  fastStart: false // ストリーミング書き込み時はfalse推奨
});

```

#### B. Video Encoder (映像圧縮)

```
const videoEncoder = new VideoEncoder({
  output: (chunk, meta) => {
    // Muxerへ書き込み
    muxer.addVideoChunk(chunk, meta);
  },
  error: (e) => console.error(e)
});

videoEncoder.configure({
  codec: 'avc1.42001f', // H.264 High Profile
  width: 1920,
  height: 1080,
  bitrate: 5_000_000, // 5Mbps
  framerate: 30
});

```

#### C. Audio Encoder (音声圧縮)

```
const audioEncoder = new AudioEncoder({
  output: (chunk, meta) => {
    muxer.addAudioChunk(chunk, meta);
  },
  error: (e) => console.error(e)
});

audioEncoder.configure({
  codec: 'mp4a.40.2', // AAC LC
  sampleRate: 44100,
  numberOfChannels: 2,
  bitrate: 128000
});

```

#### D. Demuxing (読み込みと供給) ★難所

MP4ファイルを解析し、映像・音声トラックを分離してデコーダーへ供給する実装。

メモリ枯渇を防ぐため、ファイルを一括で読み込まず、Chunk（断片）ごとに mp4box へ流し込む方式を採用する。

**実装ファイル例:** `src/lib/core/demuxer.js`

```
import MP4Box from 'mp4box';

/**
 * ファイルを解析し、デコーダーへデータを供給する
 * @param {File} file - ユーザーが選択した動画ファイル
 * @param {VideoDecoder} videoDecoder - 設定済みの映像デコーダー
 * @param {AudioDecoder} audioDecoder - 設定済みの音声デコーダー
 * @param {Function} onProgress - 進捗コールバック (0-100)
 */
export async function demuxAndDecode(file, videoDecoder, audioDecoder, onProgress) {
  const mp4boxfile = MP4Box.createFile();
  let videoTrackId = null;
  let audioTrackId = null;

  // 1. メタデータ読み込み完了時の処理 (Config作成)
  mp4boxfile.onReady = (info) => {
    // 映像トラックの抽出と設定
    const videoTrack = info.videoTracks[0];
    if (videoTrack) {
      videoTrackId = videoTrack.id;
    
      // description (avcC/hvcC) の取得: 重要
      // MP4BoxはBox構造をオブジェクトで持っているため、そこからバイナリを取り出す
      const extractedDesc = mp4boxfile.getTrackById(videoTrackId).mdia.minf.stbl.stsd.entries[0];
      const description = generateDescriptionBuffer(extractedDesc); // ※補足関数参照

      videoDecoder.configure({
        codec: videoTrack.codec,
        codedWidth: videoTrack.video.width,
        codedHeight: videoTrack.video.height,
        description: description // これがないとデコードできない
      });
      mp4boxfile.setExtractionOptions(videoTrackId, 'video', { nbSamples: 100 });
    }

    // 音声トラックの抽出と設定
    const audioTrack = info.audioTracks[0];
    if (audioTrack) {
      audioTrackId = audioTrack.id;
      audioDecoder.configure({
        codec: audioTrack.codec,
        sampleRate: audioTrack.audio.sample_rate,
        numberOfChannels: audioTrack.audio.channel_count,
        // AACの場合 description は必須ではないケースが多いが、念のため記述推奨
      });
      mp4boxfile.setExtractionOptions(audioTrackId, 'audio', { nbSamples: 100 });
    }

    mp4boxfile.start();
  };

  // 2. サンプル（フレームデータ）取得時の処理
  mp4boxfile.onSamples = (track_id, user, samples) => {
    if (track_id === videoTrackId) {
      for (const sample of samples) {
        // EncodedVideoChunk の作成
        const chunk = new EncodedVideoChunk({
          type: sample.is_sync ? 'key' : 'delta',
          timestamp: 1e6 * sample.cts / sample.timescale, // マイクロ秒変換
          duration: 1e6 * sample.duration / sample.timescale,
          data: sample.data
        });
        videoDecoder.decode(chunk);
      }
    } else if (track_id === audioTrackId) {
      for (const sample of samples) {
        // EncodedAudioChunk の作成
        const chunk = new EncodedAudioChunk({
          type: 'key', // 音声は基本すべてkey扱い
          timestamp: 1e6 * sample.cts / sample.timescale,
          duration: 1e6 * sample.duration / sample.timescale,
          data: sample.data
        });
        audioDecoder.decode(chunk);
      }
    }
  };

  // 3. ファイル読み込みループ (Memory Safe)
  // File APIの stream() または slice() を使用して少しずつ読み込む
  const chunkSize = 1024 * 1024 * 5; // 5MBずつ
  let offset = 0;

  const reader = new FileReader();
  reader.onload = (e) => {
    const buffer = e.target.result;
  
    // バッファを渡す際、第2引数にファイル内のオフセット位置を指定する必要がある
    buffer.fileStart = offset; 
    mp4boxfile.appendBuffer(buffer);
  
    offset += buffer.byteLength;
    onProgress((offset / file.size) * 100); // 進捗通知

    if (offset < file.size) {
      readNextChunk();
    } else {
      mp4boxfile.flush(); // 解析終了
    }
  };

  const readNextChunk = () => {
    const blob = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(blob);
  };

  // 読み込み開始
  readNextChunk();
}

// 補足: Description Boxのバイナリ変換ヘルパー
// MP4Boxのオブジェクト構造から、WebCodecsに必要なArrayBufferを再構築する
function generateDescriptionBuffer(entry) {
  // H.264 (avc1) の場合
  if (entry.avcC) {
    const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
    entry.avcC.write(stream);
    return new Uint8Array(stream.buffer.slice(8)); // Box Header (size+type) を除去
  } 
  // H.265 (hvc1) の場合
  else if (entry.hvcC) {
    const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
    entry.hvcC.write(stream);
    return new Uint8Array(stream.buffer.slice(8));
  }
  return null;
}

```

## 4. API連携仕様 (Client Side)

バックエンド（PHP）とはREST APIでのみ通信する。`src/lib/api/client.js` 等に実装。

### 4.1 エンドポイント一覧

| **目的**     | **メソッド** | **URLパス**                 | **リクエスト** | **レスポンス例**                            |
| ------------ | ------------ | --------------------------- | -------------- | ------------------------------------------- |
| **設定取得** | GET          | `/api/?action=preset_index` | なし           | `[{id:1, name:"1080p", config_json:{...}}]` |
| **投稿一覧** | GET          | `/api/?action=post_index`   | `limit=10`     | `[{id:1, user_name:"A", ...}]`              |
| **結果共有** | POST         | `/api/?action=post_store`   | JSON Body      | `{"message": "Created", "id": 123}`         |

### 4.2 投稿データ構造 (POST Body)

エンコード完了後、ユーザーが共有ボタンを押した際に送信するJSON。

```
{
  "user_name": "ユーザー名",
  "comment": "任意コメント",
  "config_json": {
    "codec": "avc1.42001f",
    "width": 1920,
    "height": 1080,
    "bitrate": 5000000
  },
  "benchmark_result": {
    "process_time_ms": 15000,
    "source_size_byte": 50000000,
    "output_size_byte": 10000000,
    "avg_fps": 60.5
  },
  "user_agent": "Chrome 120.0.0.0 (Windows)"
}

```

## 5. UIコンポーネント実装イメージ

### 5.1 メイン画面構成 (Svelte)

1. **DropZone:** ファイルドラッグ＆ドロップ領域
   * `<input type="file" />` を隠して実装。
2. **ConfigPanel:** 解像度やビットレートのスライダー
   * APIから取得したプリセットを選択可能にする。
3. **ProgressView:** 処理中の状態表示
   * プログレスバー (0-100%)
   * 残り時間予測 (線形回帰で簡易計算: `経過時間 / 進捗率 * 残り率`)
   * 現在の処理FPS
4. **ResultModal:** 完了後の結果表示
   * 「共有する」ボタンで `POST /api/?action=post_store` を実行。

## 6. 注意事項とトラブルシューティング

* **HTTPS必須:** `FileSystem Access API` や `WebCodecs` は Secure Context でのみ動作するため、開発環境でも `localhost` 以外でテストする場合はHTTPSが必要。
* **GOP構造:** シークバー操作をスムーズにするため、Encoder設定で KeyFrame の頻度（`avc` の場合 `latencyMode: 'quality'` や定期的なキーフレーム挿入）を意識する。
* **メモリリーク:** `VideoFrame` オブジェクトは必ず `frame.close()` で解放すること。デコーダーの出力コールバック内で `Encoder.encode(frame)` した直後に `close()` するのが基本。
