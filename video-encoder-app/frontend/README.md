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
- **ビルドツール**: Vite
- **動画処理**: WebCodecs API (ネイティブ)
- **ファイルシステム**: FileSystem Access API (ネイティブ)
- **Muxing**: `mp4-muxer` v3.x
- **Demuxing**: `mp4box.js` v0.5.x
- **WebM出力**: `webm-muxer` v5.x

### コーデック対応

- **映像**: H.264 (AVC), VP9, AV1 (ブラウザサポートに依存)
- **音声**: AAC, Opus
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
- 対応ブラウザ（WebCodecs API対応）:
  - Chrome/Edge 94以上
  - Safari 16.4以上
  - Firefox（一部機能制限あり）

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
- リアルタイム進捗表示

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

## 参考資料

- [WebCodecs API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [FileSystem Access API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [mp4-muxer - GitHub](https://github.com/Vanilagy/mp4-muxer)
- [mp4box.js - GitHub](https://github.com/gpac/mp4box.js/)
- [フロントエンド実装完全ガイド（設計当初の資料）](../../Implementation_Spec_Frontend_Complete_v3.md)

## ライセンス

このプロジェクトの詳細については、ルートディレクトリの[README](../../README.md)を参照してください。
