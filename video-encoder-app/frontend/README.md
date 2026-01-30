# ブラウザ完結型動画エンコードアプリ - フロントエンド実装ガイド

WebCodecs APIを使用したブラウザ完結型の動画エンコードアプリケーションのフロントエンド実装です。

## 📋 目次

- [技術スタック](#技術スタック)
- [アーキテクチャ](#アーキテクチャ)
- [ローカル開発環境のセットアップ](#ローカル開発環境のセットアップ)
- [プロジェクト構造](#プロジェクト構造)
- [主な機能](#主な機能)
- [開発ガイド](#開発ガイド)
- [トラブルシューティング](#トラブルシューティング)

## 技術スタック

### フロントエンド

- **フレームワーク**: Svelte 5.x
- **言語**: TypeScript/JavaScript
- **ビルドツール**: Vite 7.x
- **パッケージマネージャー**: npm

### 使用ライブラリ

- **mp4-muxer** v3.x - MP4コンテナ生成
- **mp4box.js** v0.5.x - MP4コンテナ解析・デマックス
- **webm-muxer** v5.x - WebMコンテナ生成
- **@sveltejs/vite-plugin-svelte** v6.x - ViteのSvelteプラグイン

### 使用ブラウザAPI

- **WebCodecs API** - ハードウェアアクセラレーテッド動画・音声エンコード/デコード
  - `VideoEncoder` - 映像エンコード
  - `VideoDecoder` - 映像デコード
  - `AudioEncoder` - 音声エンコード
  - `AudioDecoder` - 音声デコード
  - `VideoFrame` - 映像フレーム処理
  - `AudioData` - 音声データ処理
  - `EncodedVideoChunk` - エンコード済み映像データ
  - `EncodedAudioChunk` - エンコード済み音声データ
- **FileSystem Access API** - ローカルファイルシステムへの直接書き込み
  - `showSaveFilePicker()` - ファイル保存ダイアログ
  - `FileSystemWritableFileStream` - ストリーム書き込み
- **File API** - ファイル読み込み
  - `FileReader` - ファイルデータ読み取り
  - `Blob` - バイナリデータ処理
- **Web Workers API** - （間接的に使用、ブラウザの内部処理）

### コーデック対応

- **映像**: H.264 (AVC), VP9, AV1 (ブラウザサポートに依存)
- **音声**: AAC (AAC-LC), Opus
- **コンテナ**: MP4, WebM

## アーキテクチャ

このアプリケーションは**完全なクライアントサイド処理**を実現しています：

```text
[入力動画] → [Demuxer] → [Decoder] → [Encoder] → [Muxer] → [出力ファイル]
              (mp4box)   (WebCodecs)  (WebCodecs)  (mp4-muxer)  (FileSystem API)
```

### 主な設計思想

1. **サーバーレス動画処理**: 動画データは一切サーバーに送信せず、全てブラウザ内で処理
2. **ストリーム書き込み**: `FileSystem Access API`を使用してディスクに直接書き込み、メモリ枯渇を防止
3. **並列パイプライン**: 映像と音声を並行処理し、無音動画を防止
4. **柔軟な設定**: 解像度・フレームレート・品質を細かく調整可能

## ローカル開発環境のセットアップ

### 前提条件

- Node.js 18.x以上
- npm 9.x以上

### ブラウザ要件

#### ✅ 推奨ブラウザ（完全動作確認済み）

- **Google Chrome** 94以上 ⭐ 最も推奨
- **Microsoft Edge** 94以上 ⭐ 最も推奨
- **Brave**, **Vivaldi** 等のChromium系ブラウザ 94以上

#### ⚠️ 非推奨ブラウザ

- **Firefox**: WebCodecs APIの実装に既知の問題があります
  - AV1コーデック: エンコードが100%完了せず、不完全な動画が生成される
  - VP9コーデック: エンコードが100%完了せず、不完全な動画が生成される
  - H.264コーデック: 別のエラーが発生する可能性
  - **使用は推奨しません**

- **Safari / iOS Safari** 16.4以上: WebCodecs API対応ですが、既知の問題があります
  - 音声エンコーダーの起動に失敗する場合がある
  - 特定のコーデックがサポートされていない
  - エンコード処理が不安定で、エラーが発生する可能性
  - ファイルの読み込みに問題が発生する場合がある
  - **使用は推奨しません。Chrome または Edge をご使用ください**

#### 🧪 動作検証済みプラットフォーム

以下のプラットフォームで動作検証を実施しています：

- **Windows**
  - Google Chrome
  - Firefox（非推奨：既知の問題あり）
- **Android**
  - Google Chrome
- **iPad**
  - Safari（非推奨：既知の問題あり）

> **注意**: 上記以外のプラットフォーム・ブラウザでも動作する可能性がありますが、動作保証はありません。
> 最適な体験のため、Windows/Mac/LinuxでGoogle ChromeまたはMicrosoft Edgeの最新版をご使用ください。


### セットアップ手順

1. **リポジトリのクローン**

    ```bash
    git clone https://github.com/Shimamura-Kouki/2nd_IT-Project_BrowserVideoEncoding.git
    cd 2nd_IT-Project_BrowserVideoEncoding/video-encoder-app/frontend
    ```

2. **依存関係のインストール**

    ```bash
    npm install
    ```

3. **開発サーバーの起動**

    ```bash
    npm run dev
    ```

    ブラウザで `http://localhost:5173` にアクセスしてください。

4. **ネットワーク内の他デバイスからアクセスする場合**

    ```bash
    npm run dev -- --host
    ```

ネットワーク内の他デバイスから `http://<your-ip>:5173` でアクセス可能になります。

### ビルド

本番用にビルドする場合:

```bash
npm run build
```

ビルド成果物は `dist/` ディレクトリに出力されます。

### プレビュー

ビルド後のプレビュー:

```bash
npm run preview
```

## プロジェクト構造

```text
frontend/
├── src/
│   ├── lib/
│   │   └── core/          # 動画処理コアロジック
│   │       ├── demuxer.js # MP4解析・トラック分離
│   │       ├── encoder.js # WebCodecsエンコード＆Muxing
│   │       └── README.md  # コア実装の詳細
│   ├── App.svelte         # メインUI・進捗表示
│   └── main.js            # エントリーポイント
├── index.html
├── package.json
├── vite.config.ts
└── README.md              # このファイル
```

## 主な機能

### 1. 動画エンコード

- 入力: MP4, WebM, その他ブラウザ対応形式
- 出力: MP4 (H.264/AAC), WebM (VP9/Opus)
- リアルタイム進捗表示（読み込み・エンコード・全体の3つの進捗バー）
- Androidなどで長時間かかるファイル読み込みと、エンコード処理を別々に表示

### 2. 解像度・フレームレートプリセット

- 4K (2160p), 1440p, 1080p, 720p, 480p などの解像度プリセット
- 30fps, 60fps のフレームレート設定
- 元ファイルの設定を維持するオプション

### 3. 品質レベル設定

- 5段階の品質レベル（最高、高、中、低、最低）
- カスタムビットレート指定も可能
- コーデックに応じた自動最適化

### 4. ストリーム保存

`FileSystem Access API`を使用し、大容量動画でもメモリを圧迫せずに保存可能。

### 5. 動画ファイル問題検出

MP4Boxパーサーエラーを検出し、動画のシーク（早送り・巻き戻し）に問題がある可能性を自動的に警告します。

## 主な実装

- `src/lib/core/demuxer.js`: mp4box.jsで入力をデマックスし、デコーダへ供給
- `src/lib/core/encoder.js`: WebCodecsで再エンコードし、mp4-muxer経由で FileSystem API へストリーム保存
- `src/App.svelte`: UIと進捗表示

## 環境変数

現在、環境変数の設定は不要です。

## 開発ガイド

### セキュアコンテキストの必要性

WebCodecs APIとFileSystem Access APIは**セキュアコンテキスト**でのみ動作します:

- ✅ `http://localhost` (開発環境)
- ✅ `https://` (本番環境)
- ❌ `http://` (localhost以外)

### 主要コンポーネントの編集

#### 動画処理ロジックの変更

`src/lib/core/encoder.js` と `src/lib/core/demuxer.js` を編集してください。

#### UIの変更

`src/App.svelte` でメインインターフェースを編集できます。

#### エンコード設定の調整

`encoder.js` 内のビットレート計算式やコーデック設定を変更することで、品質・サイズのバランスを調整できます。

### デバッグのヒント

1. **ブラウザの開発者ツールを活用**
   - Console: エラーログの確認
   - Performance: パフォーマンスボトルネックの特定

2. **WebCodecsのサポート確認**

    ```javascript
    if ('VideoEncoder' in window) {
      console.log('WebCodecs対応');
    } else {
      console.log('WebCodecs非対応');
    }
    ```

3. **エンコードエラーのハンドリング**

コア処理では詳細なエラーログを出力しているため、コンソールを確認してください。

## トラブルシューティング

### Q: エンコードが途中で止まる

A: ブラウザのハードウェアアクセラレーションを確認してください。また、入力動画のコーデックがサポートされているか確認してください。

### Q: 音声が出力されない

A: 入力動画に音声トラックが含まれているか確認してください。`demuxer.js`で音声トラックの検出ログを確認できます。

### Q: メモリ不足エラーが発生する

A: FileSystem Access APIが正しく動作しているか確認してください。古いブラウザでは非対応の場合があります。

### Q: localhost以外でFileSystem APIが動作しない

A: HTTPSを使用してください。セキュアコンテキストが必要です。

### Q: 特定のコーデック（AV1など）が使えない

A: ブラウザのサポート状況を確認してください。ChromeやEdgeの最新版を推奨します。

### Q: Firefoxでエンコードが100%完了しない

A: Firefoxには既知の問題があります。WebCodecs APIの実装に不具合があり、AV1やVP9コーデックで正常に動作しません。Google ChromeまたはMicrosoft Edgeをお使いください。

### Q: Safari/iOSで音声エンコーダーが起動しない、またはエラーが発生する

A: Safari/iOSには既知の問題があります。WebCodecs APIの実装に不具合があり、音声エンコーダーの起動に失敗したり、特定のコーデックがサポートされていない場合があります。Google ChromeまたはMicrosoft Edgeをお使いください。

### Q: どのブラウザを使えばいいですか？

A: **Google Chrome**または**Microsoft Edge**の最新版を強く推奨します。これらのブラウザでは全機能が正常に動作することを確認しています。Firefox や Safari では既知の問題があり、正常に動作しません。


## 参考資料

- [WebCodecs API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [FileSystem Access API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [mp4-muxer - GitHub](https://github.com/Vanilagy/mp4-muxer)
- [mp4box.js - GitHub](https://github.com/gpac/mp4box.js/)
- [フロントエンド実装完全ガイド（設計当初の資料）](../../Implementation_Spec_Frontend_Complete_v3.md)

## ライセンス

このプロジェクトの詳細については、ルートディレクトリの[README](../../README.md)を参照してください。
