# ブラウザ完結型動画エンコードアプリ

完全にブラウザ内で動作する静的動画エンコーダーアプリケーション。サーバーサイド処理は不要です。

## ドキュメント

- 企画書 → [企画書mk3-α.md](企画書mk3-α.md)
- フロントエンド設計書 → [Implementation_Spec_Frontend_Complete_v3.md](Implementation_Spec_Frontend_Complete_v3.md)

## 稼働サイト

https://shimamura-kouki.github.io/2nd_IT-Project_BrowserVideoEncoding/

## アーキテクチャ

このアプリケーションは完全にクライアントサイドで動作します：
- **WebCodecs API** を使用したブラウザ内動画エンコーディング
- **FileSystem Access API** による直接ファイル保存
- **LocalStorage** によるプリセット管理
- サーバーサイド処理なし（静的ホスティング）