# ブラウザ完結型動画エンコードアプリ

WebCodecs APIを活用した、完全クライアントサイドで動作する動画エンコードWebアプリケーションです。
サーバー負荷ゼロ・プライバシー保護を実現し、Discord等のファイルサイズ制限に最適化したエンコードが可能です。

## 🚀 稼働サイト

<https://shimamura-kouki.github.io/2nd_IT-Project_BrowserVideoEncoding/>

## 🌐 ブラウザ対応状況

### ✅ 推奨ブラウザ（動作確認済み）

- **Google Chrome** 94以上 ⭐ 推奨
- **Microsoft Edge** 94以上 ⭐ 推奨
- **Brave**、**Vivaldi** 等の Chromium系ブラウザ

### ⚠️ 非推奨ブラウザ

- **Firefox**: WebCodecs API の実装に問題があり、AV1・VP9コーデックでエンコードが100%完了しない既知の問題があります。使用は推奨しません。

- **Safari**:  WebCodecs API対応ですが、既知の問題があります
  - 音声エンコーダーの起動に失敗する場合がある
  - 特定のコーデックがサポートされていない
  - エンコード処理が不安定で、エラーが発生する可能性
  - ファイルの読み込みに問題が発生する場合がある

### 🧪 動作検証済みプラットフォーム

以下のプラットフォームで動作検証を実施しています：

- **Windows**
  - Google Chrome
  - Firefox（非推奨：既知の問題あり）
- **Android**
  - Google Chrome
- **iPad**
  - Safari（非推奨：既知の問題あり）

> **注意**: 上記以外のプラットフォーム・ブラウザでも動作する可能性がありますが、動作保証はありません。

> **重要**: 最適な体験のため、Google ChromeまたはMicrosoft Edgeの最新版をご使用ください。

## 📚 ドキュメント

### プロジェクト資料（設計当初の情報）

- 企画書 → [企画書mk3-α.md](企画書mk3-α.md)
- フロントエンド設計書 → [Implementation_Spec_Frontend_Complete_v3.md](Implementation_Spec_Frontend_Complete_v3.md)
- バックエンド設計書 → [Implementation_Spec_Backend_Complete.md](Implementation_Spec_Backend_Complete.md)

**注**: 上記の設計書は開発初期段階で作成されたものです。実際の実装内容については、プログラム実装ガイドを参照してください。

### 開発者向け

- **プログラム実装ガイド** → [video-encoder-app/frontend/README.md](video-encoder-app/frontend/README.md)
  - ローカル開発環境のセットアップ
  - 技術スタック詳細
  - アーキテクチャ説明
  - トラブルシューティング

## ✨ 主な機能

- **完全クライアントサイド処理**: 動画データをサーバーに送信せず、ブラウザ内で完結
- **高速エンコード**: WebCodecs APIによるハードウェアアクセラレーション活用
- **大容量対応**: FileSystem Access APIによるストリーム書き込みでメモリ効率化
- **多様なコーデック対応**: H.264、VP9、AV1など（ブラウザ対応状況に依存）
- **柔軟な品質設定**: 解像度・フレームレート・ビットレートを細かく調整可能
- **詳細な進捗表示**: ファイル読み込み・エンコード処理を分けて表示（Android対応）
- **動画ファイル問題検出**: シーク不可能な動画ファイルを自動検出・警告
