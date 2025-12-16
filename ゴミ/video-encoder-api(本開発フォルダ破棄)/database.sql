-- ブラウザ完結型 動画エンコードWebアプリケーション
-- データベーススキーマ定義
-- データベースの作成
CREATE DATABASE IF NOT EXISTS video_encoder_db CHARACTER
SET
    utf8mb4 COLLATE utf8mb4_unicode_ci;

USE video_encoder_db;

-- プリセットテーブル
CREATE TABLE
    IF NOT EXISTS presets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL COMMENT 'プリセット名',
        config_json TEXT NOT NULL COMMENT 'エンコード設定（JSON形式）',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_name (name)
    ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 投稿（ベンチマーク結果）テーブル
CREATE TABLE
    IF NOT EXISTS posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_name VARCHAR(30) NOT NULL COMMENT 'ユーザー名',
        comment VARCHAR(200) DEFAULT '' COMMENT 'コメント',
        config_json TEXT NOT NULL COMMENT 'エンコード設定（JSON形式）',
        benchmark_result TEXT NOT NULL COMMENT 'ベンチマーク結果（JSON形式）',
        user_agent VARCHAR(255) NOT NULL COMMENT 'ユーザーエージェント',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at)
    ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- サンプルプリセットデータの挿入
INSERT INTO
    presets (name, config_json)
VALUES
    (
        '高画質 (H.264)',
        '{"codec": "h264", "resolution": "1920x1080", "bitrate": "5000k", "fps": 30}'
    ),
    (
        '標準画質 (H.264)',
        '{"codec": "h264", "resolution": "1280x720", "bitrate": "2500k", "fps": 30}'
    ),
    (
        'Web最適化 (VP9)',
        '{"codec": "vp9", "resolution": "1280x720", "bitrate": "1500k", "fps": 30}'
    ),
    (
        'モバイル向け (H.264)',
        '{"codec": "h264", "resolution": "854x480", "bitrate": "1000k", "fps": 24}'
    );

-- サンプル投稿データの挿入（テスト用）
INSERT INTO
    posts (
        user_name,
        comment,
        config_json,
        benchmark_result,
        user_agent
    )
VALUES
    (
        'TestUser1',
        'テストベンチマーク1',
        '{"codec": "h264", "resolution": "1920x1080"}',
        '{"encode_time": 12.5, "fps": 48.2}',
        'Mozilla/5.0 Test'
    ),
    (
        'TestUser2',
        'テストベンチマーク2',
        '{"codec": "vp9", "resolution": "1280x720"}',
        '{"encode_time": 8.3, "fps": 60.5}',
        'Mozilla/5.0 Test'
    );