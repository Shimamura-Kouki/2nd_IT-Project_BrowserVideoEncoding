
# バックエンド実装完全ガイド：動画エンコードアプリ APIサーバー

バージョン: 2.0 (Fix)

対象: サーバーサイドエンジニア (PHP/MySQL)

目的: 本書のみでAPI、データベース、初期データを実装可能にする。

## 1. アーキテクチャ概要

* **役割:** ナレッジベース（設定共有・スコアランキング）のためのAPI提供のみ。
* **制約:** * HTMLは一切出力しない（JSON Responseのみ）。
  * 動画ファイル（MP4等）のアップロードは **絶対に受け付けない** 。
  * フロントエンドの実装詳細に関知しない（疎結合）。

## 2. データベース設計 (MySQL)

以下のSQLを実行し、データベース環境を構築する。

### 2.1 スキーマ定義 (DDL)

```
CREATE DATABASE IF NOT EXISTS video_encoder_db CHARACTER SET utf8mb4;
USE video_encoder_db;

-- プリセット（公式設定）テーブル
CREATE TABLE IF NOT EXISTS presets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    config_json JSON NOT NULL, -- WebCodecs用設定オブジェクト
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 投稿（ユーザーベンチマーク）テーブル
CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_name VARCHAR(50) NOT NULL,
    comment TEXT,
    config_json JSON NOT NULL,     -- エンコードに使用した設定
    benchmark_result JSON NOT NULL, -- { "time": 120, "fps": 60 }
    user_agent VARCHAR(255),       -- ブラウザ環境情報
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

```

### 2.2 初期シードデータ (DML)

開発開始時にフロントエンドチームがAPIを利用できるよう、必ず投入しておくデータ。

```
INSERT INTO presets (name, config_json) VALUES
(
    'H.264 1080p (Balance)', 
    '{"codec":"avc1.4d002a", "width":1920, "height":1080, "bitrate":5000000, "framerate":30, "audio_bitrate":128000}'
),
(
    'H.264 720p (Light)',  
    '{"codec":"avc1.4d001f", "width":1280, "height":720,  "bitrate":2500000, "framerate":30, "audio_bitrate":96000}'
),
(
    'H.265 4K (High Quality)',  
    '{"codec":"hvc1.1.6.L150.b0", "width":3840, "height":2160, "bitrate":15000000, "framerate":60, "audio_bitrate":192000}'
);

```

## 3. ディレクトリ構造と設定

フレームワークを使用しない「Vanilla PHP + MVC」構成。

```
/public
  /api
    index.php          # エントリポイント (Front Controller)
/src
  /Config
    config.php         # DB接続設定
  /Core
    Database.php       # DB接続クラス
    ApiController.php  # 基底コントローラ
  /Controllers
    PresetController.php
    PostController.php

```

### 3.1 DB接続設定 (`src/Config/config.php`)

```
<?php
return [
    'db_host' => 'localhost',
    'db_name' => 'video_encoder_db',
    'db_user' => 'root',
    'db_pass' => '', 
    'db_charset' => 'utf8mb4'
];

```

## 4. API実装仕様

全てのエンドポイントは public/api/index.php 経由でアクセスされる。

レスポンスヘッダーには必ず Content-Type: application/json と Access-Control-Allow-Origin: * を含めること。

### 4.1 プリセット一覧取得

* **Request:** `GET /api/?action=preset_index`
* **Logic:** `presets` テーブルから全件取得してJSON出力。

### 4.2 投稿一覧取得

* **Request:** `GET /api/?action=post_index&limit=10`
* **Logic:** `posts` テーブルから `created_at` 降順で取得。

### 4.3 投稿作成（ベンチマーク共有）

* **Request:** `POST /api/?action=post_store`
* **Body:** JSON形式（フロントエンド仕様書参照）
* **Validation:**
  * `user_name`: 必須、50文字以内。
  * `config_json`, `benchmark_result`: JSONとしてパース可能であること。
  * 不正な場合は `400 Bad Request` を返す。
* **Logic:** `posts` テーブルへINSERT。成功時は `{"message": "Created", "id": [new_id]}` を返す。

## 5. セキュリティ実装要件

* **SQLインジェクション対策:** `PDO` のプリペアドステートメントを全てのクエリで使用する。文字列結合は禁止。
* **XSS対策:** 出力はJSONのみであるため、HTMLエスケープは不要だが、受け取ったデータをそのままDBに格納する際は意図しない改行コードや制御文字に注意する。

# バックエンド実装完全ガイド：動画エンコードアプリ APIサーバー

バージョン: 2.0 (Fix)

対象: サーバーサイドエンジニア (PHP/MySQL)

目的: 本書のみでAPI、データベース、初期データを実装可能にする。

## 1. アーキテクチャ概要

* **役割:** ナレッジベース（設定共有・スコアランキング）のためのAPI提供のみ。
* **制約:** * HTMLは一切出力しない（JSON Responseのみ）。
  * 動画ファイル（MP4等）のアップロードは **絶対に受け付けない** 。
  * フロントエンドの実装詳細に関知しない（疎結合）。

## 2. データベース設計 (MySQL)

以下のSQLを実行し、データベース環境を構築する。

### 2.1 スキーマ定義 (DDL)

```
CREATE DATABASE IF NOT EXISTS video_encoder_db CHARACTER SET utf8mb4;
USE video_encoder_db;

-- プリセット（公式設定）テーブル
CREATE TABLE IF NOT EXISTS presets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    config_json JSON NOT NULL, -- WebCodecs用設定オブジェクト
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 投稿（ユーザーベンチマーク）テーブル
CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_name VARCHAR(50) NOT NULL,
    comment TEXT,
    config_json JSON NOT NULL,     -- エンコードに使用した設定
    benchmark_result JSON NOT NULL, -- { "time": 120, "fps": 60 }
    user_agent VARCHAR(255),       -- ブラウザ環境情報
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

```

### 2.2 初期シードデータ (DML)

開発開始時にフロントエンドチームがAPIを利用できるよう、必ず投入しておくデータ。

```
INSERT INTO presets (name, config_json) VALUES
(
    'H.264 1080p (Balance)', 
    '{"codec":"avc1.4d002a", "width":1920, "height":1080, "bitrate":5000000, "framerate":30, "audio_bitrate":128000}'
),
(
    'H.264 720p (Light)',  
    '{"codec":"avc1.4d001f", "width":1280, "height":720,  "bitrate":2500000, "framerate":30, "audio_bitrate":96000}'
),
(
    'H.265 4K (High Quality)',  
    '{"codec":"hvc1.1.6.L150.b0", "width":3840, "height":2160, "bitrate":15000000, "framerate":60, "audio_bitrate":192000}'
);

```

## 3. ディレクトリ構造と設定

フレームワークを使用しない「Vanilla PHP + MVC」構成。

```
/public
  /api
    index.php          # エントリポイント (Front Controller)
/src
  /Config
    config.php         # DB接続設定
  /Core
    Database.php       # DB接続クラス
    ApiController.php  # 基底コントローラ
  /Controllers
    PresetController.php
    PostController.php

```

### 3.1 DB接続設定 (`src/Config/config.php`)

```
<?php
return [
    'db_host' => 'localhost',
    'db_name' => 'video_encoder_db',
    'db_user' => 'root',
    'db_pass' => '', 
    'db_charset' => 'utf8mb4'
];

```

## 4. API実装仕様

全てのエンドポイントは public/api/index.php 経由でアクセスされる。

レスポンスヘッダーには必ず Content-Type: application/json と Access-Control-Allow-Origin: * を含めること。

### 4.1 プリセット一覧取得

* **Request:** `GET /api/?action=preset_index`
* **Logic:** `presets` テーブルから全件取得してJSON出力。

### 4.2 投稿一覧取得

* **Request:** `GET /api/?action=post_index&limit=10`
* **Logic:** `posts` テーブルから `created_at` 降順で取得。

### 4.3 投稿作成（ベンチマーク共有）

* **Request:** `POST /api/?action=post_store`
* **Body:** JSON形式（フロントエンド仕様書参照）
* **Validation:**
  * `user_name`: 必須、50文字以内。
  * `config_json`, `benchmark_result`: JSONとしてパース可能であること。
  * 不正な場合は `400 Bad Request` を返す。
* **Logic:** `posts` テーブルへINSERT。成功時は `{"message": "Created", "id": [new_id]}` を返す。

## 5. セキュリティ実装要件

* **SQLインジェクション対策:** `PDO` のプリペアドステートメントを全てのクエリで使用する。文字列結合は禁止。
* **XSS対策:** 出力はJSONのみであるため、HTMLエスケープは不要だが、受け取ったデータをそのままDBに格納する際は意図しない改行コードや制御文字に注意する。
