# ブラウザ完結型動画エンコードアプリ

WebCodecs APIを活用した、完全クライアントサイドで動作する動画エンコードWebアプリケーションです。  
サーバー負荷ゼロ・プライバシー保護を実現し、Discord等のファイルサイズ制限に最適化したエンコードが可能です。

## 🚀 稼働サイト

https://shimamura-kouki.github.io/2nd_IT-Project_BrowserVideoEncoding/

## 📚 ドキュメント

### プロジェクト資料
- 企画書 → [企画書mk3-α.md](企画書mk3-α.md)
- フロントエンド設計書 → [Implementation_Spec_Frontend_Complete_v3.md](Implementation_Spec_Frontend_Complete_v3.md)
- バックエンド設計書 → [Implementation_Spec_Backend_Complete.md](Implementation_Spec_Backend_Complete.md)

### 開発者向け
- **プログラム実装ガイド** → [video-encoder-app/README.md](video-encoder-app/README.md)
  - ローカル開発環境のセットアップ
  - 技術スタック詳細
  - アーキテクチャ説明
  - トラブルシューティング

## 主な機能

- **完全クライアントサイド処理**: 動画データをサーバーに送信せず、ブラウザ内で完結
- **容量ターゲットエンコード**: Discord (8MB)、Twitter (25MB)などの制限に最適化
- **高速エンコード**: WebCodecs APIによるハードウェアアクセラレーション活用
- **大容量対応**: FileSystem Access APIによるストリーム書き込みでメモリ効率化
- **ベンチマーク機能**: エンコード性能の自動計測と共有