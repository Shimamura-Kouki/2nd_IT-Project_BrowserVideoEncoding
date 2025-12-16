# ブラウザ完結型 動画エンコードWebアプリケーション - APIサーバー (α版)

## 概要

このプロジェクトは、動画エンコードWebアプリケーションのバックエンドAPIサーバーです。
詳細設計書に基づき、MVCパターンで実装されています。

## ディレクトリ構造

```
video-encoder-api/
├── public/
│   └── api/
│       ├── index.php        # フロントコントローラ（エントリポイント）
│       └── .htaccess         # Apache設定
├── src/
│   ├── Config/
│   │   └── config.php       # DB接続設定（Git管理外）
│   ├── Core/
│   │   ├── Database.php     # DB接続クラス（Singleton）
│   │   └── ApiController.php # 基底コントローラ
│   ├── Models/
│   │   ├── PresetModel.php  # プリセットモデル
│   │   └── PostModel.php    # 投稿モデル
│   └── Controllers/
│       ├── PresetController.php # プリセットコントローラ
│       └── PostController.php   # 投稿コントローラ
├── database.sql              # データベーススキーマ
├── .gitignore
└── README.md

```

## セットアップ手順

### 1. データベースの作成

```bash
# MySQLにログイン
mysql -u root -p

# SQLファイルを実行
source database.sql
```

または、phpMyAdminで `database.sql` をインポートしてください。

### 2. データベース接続設定

`src/Config/config.php` ファイルを編集し、データベース接続情報を設定してください。

```php
return [
    'db_host' => 'localhost',
    'db_name' => 'video_encoder_db',
    'db_user' => 'your_username',
    'db_pass' => 'your_password',
];
```

**注意**: このファイルは `.gitignore` に含まれています。本番環境では環境変数の使用を推奨します。

### 3. Webサーバーの設定

#### XAMPP の場合

1. `video-encoder-api` フォルダを `C:\xampp\htdocs\` に配置
2. Apache を起動
3. ブラウザで `http://localhost/video-encoder-api/public/api/presets` にアクセスして動作確認

#### Apache + mod_rewrite が必要

`.htaccess` ファイルが機能するように、Apache の `mod_rewrite` が有効になっている必要があります。

## APIエンドポイント

### プリセット一覧取得

- **URL**: `GET /api/presets`
- **説明**: 全てのエンコードプリセット設定を取得
- **レスポンス例**:

```json
[
  {
    "id": 1,
    "name": "高画質 (H.264)",
    "config_json": "{\"codec\": \"h264\", \"resolution\": \"1920x1080\"}"
  }
]
```

### 投稿一覧取得

- **URL**: `GET /api/posts?limit=10`
- **説明**: 最新のベンチマーク投稿を取得
- **パラメータ**:
  - `limit` (オプション): 取得件数（デフォルト: 10、最大: 50）
- **レスポンス例**:

```json
[
  {
    "id": 1,
    "user_name": "TestUser1",
    "comment": "テストベンチマーク",
    "config_json": "{\"codec\": \"h264\"}",
    "benchmark_result": "{\"encode_time\": 12.5, \"fps\": 48.2}",
    "user_agent": "Mozilla/5.0...",
    "created_at": "2025-12-16 10:00:00"
  }
]
```

### 新規投稿作成

- **URL**: `POST /api/posts`
- **Content-Type**: `application/json`
- **リクエストボディ例**:

```json
{
  "user_name": "TestUser",
  "comment": "テストコメント",
  "config_json": {
    "codec": "h264",
    "resolution": "1920x1080"
  },
  "benchmark_result": {
    "encode_time": 12.5,
    "fps": 48.2
  }
}
```

- **レスポンス例**:

```json
{
  "message": "Post created successfully"
}
```

## セキュリティ対策

- **SQLインジェクション対策**: プリペアドステートメントを使用
- **XSS対策**: フロントエンドでのエスケープに委ねる（DB保存時は生データ）
- **CORS**: `Access-Control-Allow-Origin` ヘッダーで制御
- **バリデーション**: Controller層でFail Fastパターンを採用

## 開発状況

**バージョン**: α (アルファ版)  
**実装日**: 2025年12月16日  
**ステータス**: 基本機能実装完了

## 今後の課題

- ユニットテストの作成
- エラーログの詳細化
- 本番環境用の設定ファイル管理
- パフォーマンス最適化
- セキュリティ監査

## ライセンス

学校プロジェクト用
