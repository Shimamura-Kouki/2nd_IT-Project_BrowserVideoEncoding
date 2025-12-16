<?php

/**
 * データベース接続クラス (Singleton)
 * 
 * PDOを使用したデータベース接続を管理する。
 * セキュリティとエラーハンドリングのための推奨設定を適用。
 */

namespace App\Core;

use PDO;
use PDOException;

class Database
{
    private static ?Database $instance = null;
    private ?PDO $pdo = null;

    /**
     * コンストラクタをprivateにしてシングルトンパターンを実装
     */
    private function __construct()
    {
        $config = require __DIR__ . '/../Config/config.php';

        try {
            $dsn = "mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4";
            $this->pdo = new PDO(
                $dsn,
                $config['db_user'],
                $config['db_pass'],
                [
                    // エラー時に例外をスローする
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    // プリペアドステートメントのエミュレーションを無効化（SQLインジェクション対策の要）
                    PDO::ATTR_EMULATE_PREPARES => false,
                    // デフォルトのフェッチモードを連想配列に設定
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]
            );
        } catch (PDOException $e) {
            // 本番環境では詳細なエラー情報を隠蔽する
            error_log('Database Connection Error: ' . $e->getMessage());
            // 開発環境: 詳細エラーを表示（本番環境では下行をコメントアウト）
            throw new \Exception('Database connection failed: ' . $e->getMessage());
        }
    }

    /**
     * シングルトンインスタンスを取得
     * 
     * @return Database
     */
    public static function getInstance(): Database
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * PDOコネクションを取得
     * 
     * @return PDO
     */
    public function getConnection(): PDO
    {
        return $this->pdo;
    }

    /**
     * クローンを防止
     */
    private function __clone() {}

    /**
     * デシリアライゼーションを防止
     */
    public function __wakeup()
    {
        throw new \Exception("Cannot unserialize singleton");
    }
}
