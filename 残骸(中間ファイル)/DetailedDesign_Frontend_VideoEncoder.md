# 詳細設計書（フロントエンド）：ブラウザ完結型 動画エンコードWebアプリケーション

バージョン: 1.0

確定日: 2025年12月16日

対象: フロントエンド実装担当者

準拠: 企画書mk2-v1.md / DetailedDesign_VideoEncoder_Final.md

## 1. 概要と技術スタック

本ドキュメントは、Svelteを用いたSPA（Single Page Application）の実装詳細を定義する。

サーバーサイドでのHTML生成は行わず、全てのUIレンダリングと動画処理ロジックをクライアントサイドで完結させる。

### 1.1 技術スタック要件

* **Framework** : Svelte 4.x or 5.x (Viteベース)
* **Language** : TypeScript (推奨) または JavaScript (ESModules)
* **Styling** : Scoped CSS (Svelte標準), 必要に応じてTailwind CSSなど
* **Core Libraries** :
* `mp4box.js`: MP4コンテナ生成 (Muxing)
* `webm-muxer`: WebMコンテナ生成 (Muxing)
* **Web APIs** :
* `WebCodecs API`: ハードウェアアクセラレーションエンコード
* `FileSystem Access API`: ストリームファイル書き込み
* `Web Workers`: メインスレッド（UI）ブロック回避のための処理オフロード

## 2. ディレクトリ構造とアーキテクチャ

UIコンポーネントと、複雑なエンコードロジックを持つ「コアモジュール」を明確に分離する。

```
/src
  /assets          # 静的アセット
  /lib
    /api           # バックエンド通信層
      client.js    # fetchラッパー
    /components    # UIコンポーネント
      /common      # ボタン、カード、入力欄など
      /encoder     # エンコード関連 (DropZone, Settings, Progress)
      /community   # 投稿・閲覧関連 (PostList, ResultCard)
    /core          # エンコードエンジン (ビジネスロジック)
      Engine.js    # WebCodecs統括マネージャー
      Muxer.js     # mp4box/webm-muxer ラッパー
      FileWriter.js # FileSystem Access API ラッパー
    /stores        # Svelte Stores (状態管理)
      appState.js  # アプリ全体のステート
      presets.js   # プリセットデータ
  App.svelte       # ルートコンポーネント
  main.js          # エントリーポイント

```

## 3. 画面遷移とステート管理 (SPA)

ページ遷移（ルーティング）は使用せず、アプリケーションの状態（Status）によって表示コンポーネントを切り替える「ステートマシン」として設計する。

### 3.1 アプリケーションステート (`encodingStatus`)

| **ステータス** | **画面/コンポーネント** | **ユーザーのアクション**                     |
| -------------------- | ----------------------------- | -------------------------------------------------- |
| **IDLE**       | `ConfigView`                | ファイル選択、エンコード設定、プリセット選択       |
| **PROCESSING** | `ProcessingView`            | 進捗確認、処理キャンセル                           |
| **COMPLETED**  | `ResultView`                | 結果確認、スコア表示、サーバーへ投稿、トップへ戻る |
| **ERROR**      | `ErrorModal`                | エラー内容確認、リトライ                           |

## 4. コアロジック詳細設計 (高難易度領域)

WebCodecs APIとFileSystem Access APIを連携させるパイプライン設計。UIスレッドをフリーズさせないため、可能な限り非同期処理またはWorkerを利用する。

### 4.1 エンコードパイプライン (`/lib/core/Engine.js`)

#### 処理フロー

1. **File Reading** : ユーザーがドロップした動画ファイルを `VideoDecoder` に流し込む。
2. **Decoding** : フレーム単位 (`VideoFrame`) にデコード。
3. **Encoding** : 設定されたパラメータ（ビットレート、解像度）に基づき `VideoEncoder` で再圧縮。
4. **Muxing** : エンコードされた `EncodedVideoChunk` をコンテナ（MP4/WebM）に格納。
5. **Writing** : `FileSystemWritableFileStream` を使い、チャンク生成の都度、即座にディスクへ書き込む（メモリ枯渇防止）。

#### 必須クラス・メソッド要件

* **`loadConfig(config)`** : エンコード設定（Codec, Bitrate, FPS等）の読み込み。
* **`setInputFile(file)`** : ソースファイルのセット。
* **`setOutputFileHandle(handle)`** : 保存先ファイルハンドルのセット。
* **`start()`** : 処理開始。
* **`cancel()`** : 処理中断とリソース解放（`close()`）。

### 4.2 ストリーム書き込み (`/lib/core/FileWriter.js`)

**企画書のTier 1最重要技術。** ブラウザメモリに全データを保持せず、逐次書き込みを行う。

* `showSaveFilePicker()` を呼び出し、ユーザーに保存先を指定させる。
* 取得した `FileSystemFileHandle` から `createWritable()` でストリームを取得。
* Muxerからデータが来るたびに `writable.write(chunk)` を実行。
* 処理完了時に `writable.close()`。

## 5. UIコンポーネント詳細設計

### 5.1 設定・入力画面 (`ConfigView`)

* **`DropZone.svelte`**
  * 全画面または中央に大きく配置。ドラッグ＆ドロップ対応。
  * バリデーション: 動画ファイル以外（画像、テキスト等）は拒否する。
* **`PresetSelector.svelte`**
  * サーバーAPI (`GET /api/?action=preset_index`) から取得したプリセットを表示。
  * 選択時に `config_json` の内容をフォームに反映。
* **`AdvancedSettings.svelte`** (アコーディオンUI推奨)
  * Codec (H.264 / VP9 / AV1)
  * 解像度 (Original / 1080p / 720p)
  * Bitrate (スライダー UI)

### 5.2 処理中画面 (`ProcessingView`)

* **`ProgressBar.svelte`**
  * トータルフレーム数に対する現在の処理フレーム数の割合を表示。
  * 「残り時間予測」の実装（直近の処理速度から算出）。
* **`LogConsole.svelte`** (開発者向け/ギーク向け)
  * リアルタイムログ表示（例: `Frame 120 encoded. Speed: 45fps`）。

### 5.3 リザルト・投稿画面 (`ResultView`)

* **`BenchmarkScore.svelte`**
  * エンコード時間、平均FPS、圧縮率（元サイズ vs 新サイズ）を大きく表示。
  * OneUIライクなカードデザイン。
* **`PostForm.svelte`**
  * **重要** : バックエンド設計書 `PostController::store` に対応するフォーム。
  * **入力項目** :
  * `user_name`: ニックネーム（必須）
  * `comment`: コメント（任意）
  * **自動送信データ** (ユーザー入力不可):
    * `config_json`: 使用した設定データ
    * `benchmark_result`: `{ encode_time: 120, fps: 60 }` 形式のJSON
    * `user_agent`: `navigator.userAgent`
  * **送信ボタン** : 「スコアを共有する（投稿）」

### 5.4 ナレッジベース (`CommunityView`)

* 画面下部または別タブに配置。
* API (`GET /api/?action=post_index&limit=10`) から最新の投稿を取得してリスト表示。
* 各カードに「設定をコピー」ボタンを配置し、押下するとその設定を `ConfigView` に反映させる機能（ナレッジ共有）。

## 6. API連携仕様 (Integration)

`src/lib/api/client.js` に実装。バックエンドの仕様に厳密に準拠する。

### 6.1 エンドポイント定義

| **機能**           | **メソッド** | **URL (例)**            | **パラメータ / Body** | **レスポンス期待値**                        |
| ------------------------ | ------------------ | ----------------------------- | --------------------------- | ------------------------------------------------- |
| **プリセット取得** | GET                | `/api/?action=preset_index` | なし                        | `[{id, name, config_json}, ...]`                |
| **投稿一覧取得**   | GET                | `/api/?action=post_index`   | `limit=10`                | `[{id, user_name, benchmark_result, ...}, ...]` |
| **投稿作成**       | POST               | `/api/?action=post_store`   | JSON Body (詳細下記)        | `{"message": "Created"}`                        |

### 6.2 投稿データ構造 (POST Body)

バックエンドのバリデーションを通過するため、以下のJSON構造を構築して送信すること。

```
{
  "user_name": "ユーザー入力値",
  "comment": "ユーザー入力値",
  "config_json": {
    "codec": "avc1.4d002a",
    "width": 1920,
    "height": 1080,
    "bitrate": 5000000
  },
  "benchmark_result": {
    "encode_time": 45.5,
    "fps": 120.5,
    "original_size": 500000000,
    "compressed_size": 25000000
  },
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; ...)"
}

```
