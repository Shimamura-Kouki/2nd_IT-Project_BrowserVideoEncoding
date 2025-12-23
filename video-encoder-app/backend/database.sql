CREATE DATABASE IF NOT EXISTS video_encoder_db CHARACTER
SET
    utf8mb4;

USE video_encoder_db;

CREATE TABLE
    IF NOT EXISTS presets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        config_json JSON NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE
    IF NOT EXISTS posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_name VARCHAR(50) NOT NULL,
        comment TEXT,
        config_json JSON NOT NULL,
        benchmark_result JSON NOT NULL,
        user_agent VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

INSERT INTO
    presets (name, config_json)
VALUES
    (
        'H.264 1080p (Balance)',
        '{"codec":"avc1.4d002a", "width":1920, "height":1080, "bitrate":5000000, "framerate":30, "audio_bitrate":128000}'
    ),
    (
        'H.264 720p (Light)',
        '{"codec":"avc1.4d001f", "width":1280, "height":720, "bitrate":2500000, "framerate":30, "audio_bitrate":96000}'
    ),
    (
        'H.265 4K (High Quality)',
        '{"codec":"hvc1.1.6.L150.b0", "width":3840, "height":2160, "bitrate":15000000, "framerate":60, "audio_bitrate":192000}'
    );