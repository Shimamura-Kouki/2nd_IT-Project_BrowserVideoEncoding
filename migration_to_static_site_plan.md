# 静的サイト(GitHub Pages)への移行計画書

**作成日**: 2026年1月20日  
**ブランチ**: `feature/static-github-pages`  
**対象**: Video Encoder Web Application

---

## 1. 移行概要

### 現在の構成
- **バックエンド**: PHP API (video-encoder-app/backend)
- **フロントエンド**: Svelte + Vite (video-encoder-app/frontend)
- **ホスティング**: XAMPP (ローカル開発環境)

### 目標構成
- **バックエンド**: なし（静的サイト）
- **フロントエンド**: HTML/CSS/JavaScript（純静的ファイル）
- **ホスティング**: GitHub Pages
- **アーキテクチャ**: クライアントサイド処理（ブラウザ内でビデオエンコーディング）

---

## 2. 移行範囲と制約

### 機能の変更
| 機能                   | 現在         | 移行後           | 備考                      |
| ---------------------- | ------------ | ---------------- | ------------------------- |
| ビデオエンコーディング | API経由      | クライアント処理 | FFmpeg.js/Web Workers使用 |
| プリセット管理         | DB           | ローカルStorage  | ブラウザに保存            |
| ポスト/エクスポート    | サーバー処理 | ブラウザ処理     | Blob/Download API         |
| 認証                   | なし         | なし             | 不要                      |

### 技術的な制限
- ファイルサイズ: ブラウザのメモリ制限
- 処理時間: エンコーディングはCPU依存
- ストレージ: LocalStorage（10MB程度）

---

## 3. フロントエンド移行タスク

### 3.1 ビルド構成の変更
- [x] Viteビルド設定を GitHub Pages対応に変更
  - `base: /2nd_IT-Project_BrowserVideoEncoding/`を設定
  - 出力先を`docs/`に統一（GitHub Pages設定用）

### 3.2 API呼び出しの削除
- [x] `src/lib/api/client.js` の削除
- [x] APIベースURL参照の削除
- [x] サーバーフェッチの削除

### 3.3 ローカルStorage対応
- [x] プリセット管理ロジックをLocalStorage対応に
- [x] 保存・読み込み機能の実装
- [x] デフォルトプリセットの組み込み

### 3.4 エンコーディングエンジンの強化
- [ ] クライアントサイドFFmpeg.js統合
- [ ] Web Worker実装（メインスレッドのブロッキング防止）
- [ ] Progress表示の改善

### 3.5 静的ファイル対応
- [ ] `index.html` の直接ホスト対応
- [ ] アセット参照の相対パス化
- [ ] SPA ルーティング不要の確認

---

## 4. バックエンド削除タスク

### 4.1 削除対象
- [x] `video-encoder-app/backend/` ディレクトリ全体
- [x] `database.sql`
- [x] PHP API スクリプト

### 4.2 依存関係の削除
- [x] backend `README.md` 削除
- [x] API documentation 削除

---

## 5. デプロイメント構成

### 5.1 GitHub Pages設定
- [ ] リポジトリ設定で `docs/` フォルダを公開
- [ ] Branch: `feature/static-github-pages` を設定
- [ ] カスタムドメイン（不要な場合は skip）

### 5.2 ビルド・デプロイスクリプト
- [ ] `npm run build` で自動生成
- [ ] `docs/` に成果物を出力
- [ ] `.gitignore` で不要ファイルを除外

---

## 6. テスト計画

### 6.1 機能テスト
- [ ] ビデオアップロード
- [ ] エンコーディング処理（複数フォーマット）
- [ ] プリセット保存・読み込み
- [ ] ダウンロード機能
- [ ] ローカルStorage永続性

### 6.2 環境テスト
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] モバイルブラウザ

### 6.3 パフォーマンステスト
- [ ] 大容量ファイル処理
- [ ] メモリ使用量監視
- [ ] エンコーディング時間計測

---

## 7. ディレクトリ構造

```
video-encoder-app/
├── frontend/                    # 本番ファイル
│   ├── src/
│   ├── lib/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── docs/                        # ビルド出力（GitHub Pages用）
│   ├── index.html
│   ├── assets/
│   └── ...
└── [backend は削除]
```

---

## 8. 移行スケジュール

| フェーズ | 内容                        | 期間 |
| -------- | --------------------------- | ---- |
| 準備     | 計画・設計確定              | 1日  |
| 実装     | フロントエンド修正・API削除 | 3日  |
| テスト   | 機能・互換性テスト          | 2日  |
| デプロイ | GitHub Pages設定・リリース  | 1日  |

---

## 9. リスク管理

| リスク               | 影響度 | 対策                     |
| -------------------- | ------ | ------------------------ |
| ブラウザメモリ不足   | 中     | 大容量ファイルの分割処理 |
| FFmpeg.js対応性      | 中     | フォーマット制限の明記   |
| LocalStorage容量不足 | 低     | プリセット数制限         |
| 古いブラウザ非対応   | 低     | 必要環境を明記           |

---

## 10. 成功基準

- [x] ブランチ作成完了
- [ ] フロントエンドビルド成功
- [ ] 全機能テスト合格
- [ ] GitHub Pages公開完了
- [ ] README更新完了

---

## 参考資料

- [GitHub Pages公式ドキュメント](https://pages.github.com/)
- [Vite GitHub Pages設定](https://vitejs.dev/guide/static-deploy.html#github-pages)
- [FFmpeg.js](https://github.com/Kagami/ffmpeg.js)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)

---

**次のステップ**: 
1. フロントエンド設定の確認
2. ビルド構成の変更実装
3. API削除の実装
