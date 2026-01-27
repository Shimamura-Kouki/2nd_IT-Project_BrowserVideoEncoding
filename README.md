# ブラウザ完結型動画エンコードアプリ

WebCodecs APIを活用した、完全クライアントサイドで動作する動画エンコードWebアプリケーションです。  
サーバー負荷ゼロ・プライバシー保護を実現し、Discord等のファイルサイズ制限に最適化したエンコードが可能です。

## 🚀 稼働サイト

https://shimamura-kouki.github.io/2nd_IT-Project_BrowserVideoEncoding/

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

## 主な機能

- **完全クライアントサイド処理**: 動画データをサーバーに送信せず、ブラウザ内で完結
- **高速エンコード**: WebCodecs APIによるハードウェアアクセラレーション活用
- **大容量対応**: FileSystem Access APIによるストリーム書き込みでメモリ効率化