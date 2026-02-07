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

- **mp4-muxer** v3.x - MP4コンテナ生成（ストリーム書き込み対応）
- **mp4box.js** v0.5.x - MP4コンテナ解析・デマックス
- **webm-muxer** v5.x - WebMコンテナ生成（ストリーム書き込み対応）
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

- **映像**: 
  - H.264 (AVC) - avc1.42001e, avc1.42001f, avc1.640028など
  - H.265 (HEVC) - hev1.1.6.L93.B0など（ブラウザサポート限定的）
  - VP8 - vp8
  - VP9 - vp09.00.31.08など
  - AV1 - av01.0.04M.08など（次世代コーデック）
- **音声**: 
  - AAC-LC (AAC Low Complexity) - mp4a.40.2
  - AAC-HE (High Efficiency AAC) - mp4a.40.5
  - AAC-HE v2 - mp4a.40.29
  - Opus - opus（WebM用）
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
│   │   ├── core/                 # 動画処理コアロジック
│   │   │   ├── demuxer.js        # MP4解析・トラック分離
│   │   │   ├── encoder.js        # WebCodecsエンコード＆Muxing
│   │   │   └── README.md         # コア実装の詳細
│   │   ├── utils/                # ユーティリティ関数
│   │   │   └── audioUtils.js     # 音声ビットレート検証・調整
│   │   ├── constants.js          # 定数定義
│   │   ├── presets.js            # プリセット定義とローディング
│   │   └── theme.ts              # テーマ管理
│   ├── App.svelte                # メインUI・進捗表示
│   ├── ThemeSwitcher.svelte      # テーマ切り替えコンポーネント
│   ├── app.css                   # グローバルスタイル
│   └── main.ts                   # エントリーポイント
├── index.html
├── package.json
├── vite.config.ts
└── README.md                      # このファイル
```

## 主な機能

### 1. 動画エンコード

- 入力: MP4, WebM, その他ブラウザ対応形式
- 出力: MP4 (H.264/H.265/AAC) または WebM (VP8/VP9/AV1/Opus)
- リアルタイム進捗表示（読み込み・エンコード・全体の3つの進捗バー）
- Androidなどで長時間かかるファイル読み込みと、エンコード処理を別々に表示

### 2. 品質制御モード

- **QP（量子化パラメータ）モード** （デフォルト、推奨）
  - 一定の品質を保つ高度な制御方式
  - QP値: 18（最高品質）～ 38（最低品質）
  - ファイルサイズは変動するが品質が一定
  - H.264/H.265: QP範囲 0-51、VP9/AV1: QP範囲 0-63
- **VBR（可変ビットレート）モード**
  - 従来型のビットレート指定方式
  - 複雑なシーンで高ビットレート、静止シーンで低ビットレート
- **CBR（固定ビットレート）モード**
  - ストリーミング用の固定レート方式
  - 常に一定のビットレートを維持

### 3. 解像度設定

- **プリセット**: 4K (3840x2160)、1440p (2560x1440)、1080p (1920x1080)、720p (1280x720)、480p (854x480) など
- **手動設定**: 幅と高さを個別に指定
- **幅のみ指定**: 高さを自動計算（アスペクト比維持）
- **高さのみ指定**: 幅を自動計算（アスペクト比維持）
- **元ファイル維持**: 入力動画の解像度をそのまま使用

### 4. フレームレート設定

- **元ファイル維持**: 入力動画のフレームレートを使用
- **手動指定**: 任意のフレームレート（30fps、60fpsなど）を指定可能

### 5. 品質プリセット

- 5段階の品質レベル（最高、高、中、低、最低）
- カスタムビットレート/QP値指定も可能
- コーデックに応じた自動最適化（VP9やAV1は30%程度低いビットレートで同等品質）

### 6. エンコード設定プリセット

- **組み込みプリセット**: QP高品質、VBR 4K/1440p/1080p/720pなど複数のプリセットを用意
- **プリセット選択**: ドロップダウンから選択して設定を一括適用
- **プリセット内容**: コンテナ形式、コーデック、解像度、ビットレートモード、品質設定などを含む
- **手動調整**: プリセット適用後も個別の設定を変更可能

**注意**: 現在、ユーザーが独自のプリセットを保存する機能は実装されていません。組み込みプリセットのみ使用できます。

### 7. ストリーム保存

`FileSystem Access API`を使用し、大容量動画でもメモリを圧迫せずに保存可能。
Firefoxなど非対応ブラウザでは、メモリ内バッファを使用してダウンロード。

### 8. 動画ファイル問題検出

MP4Boxパーサーエラーを検出し、動画のシーク（早送り・巻き戻し）に問題がある可能性を自動的に警告します。

### 9. ブラウザ互換性警告

FirefoxやSafariでの既知の問題を自動検出し、警告を表示します。

### 10. テーマ切り替え

ダーク/ライトテーマの切り替えに対応。ユーザー設定は保存されます。

## 主な実装

- `src/lib/core/demuxer.js`: mp4box.jsで入力をデマックスし、デコーダへ供給
  - 音声トラック検出機能により、無音動画でも正しく処理
  - MP4Boxエラーの自動検出と警告機能
- `src/lib/core/encoder.js`: WebCodecsで再エンコードし、mp4-muxer/webm-muxer経由で FileSystem API へストリーム保存
  - QP（量子化パラメータ）モードサポート
  - 3種類のビットレートモード（Quantizer/VBR/CBR）対応
  - 2パスエンコーディング処理（デュレーション取得＋本エンコード）
  - Firefox用メモリバッファフォールバック
- `src/lib/utils/audioUtils.js`: AAC音声ビットレートの検証と自動調整
  - AAC仕様に準拠したビットレート値への自動丸め処理
- `src/lib/presets.js`: 組み込みプリセットの定義（QP/VBR各種プリセット）
  - LocalStorage機能は実装されているが、UI未実装のため現在未使用
- `src/lib/theme.ts`: ダーク/ライトテーマの管理
- `src/App.svelte`: UIと進捗表示、設定画面

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
   - Console: エラーログの確認（詳細なエンコード情報が出力されます）
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
- チャンク追加の成功/失敗数
- タイムスタンプの正規化状況
- エンコーダーの状態遷移

4. **QP（量子化パラメータ）モードのデバッグ**

   ```javascript
   // encoder.jsのログ出力例
   console.log('Encoding with QP mode, quantizer:', config.video.quantizer);
   ```

5. **ビットレート自動調整の確認**

   ```javascript
   // コーデック効率による自動調整
   // VP9: -30%、AV1: -50%
   console.log('Adjusted bitrate for codec:', adjustedBitrate);
   ```

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

### Q: QP（量子化パラメータ）モードとビットレートモードの違いは？

A: 
- **QPモード（推奨）**: 品質を一定に保つ方式。QP値が低いほど高品質。ファイルサイズは変動しますが、シーンの複雑さに関わらず品質が一定です。
- **ビットレートモード**: ファイルサイズを予測しやすい従来方式。VBR（可変）とCBR（固定）があります。

### Q: VP9やAV1のビットレートが自動的に低くなるのはなぜ？

A: VP9は約30%、AV1は約50%の圧縮効率向上があるため、同じ品質を得るのに必要なビットレートが低くなります。アプリが自動的に最適なビットレートに調整します。

### Q: AAC音声ビットレートでカスタム値が使えない

A: AAC-LC仕様により、有効なビットレートは96, 128, 160, 192 Kbpsのみです。他の値を入力すると、最も近い有効値に自動調整されます。Opusコーデック（WebM）では任意のビットレートが使用可能です。


## 参考資料

- [WebCodecs API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [FileSystem Access API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [mp4-muxer - GitHub](https://github.com/Vanilagy/mp4-muxer)
- [mp4box.js - GitHub](https://github.com/gpac/mp4box.js/)
- [フロントエンド実装完全ガイド（設計当初の資料）](../../Implementation_Spec_Frontend_Complete_v3.md)

## ライセンス

このプロジェクトの詳細については、ルートディレクトリの[README](../../README.md)を参照してください。
