<?php

/**
 * 投稿・ベンチマークモデルクラス
 * 
 * ユーザー投稿データ（ベンチマーク結果）へのアクセスを提供する。
 */

namespace App\Models;

use App\Core\Database;
use PDO;
use PDOException;

class PostModel
{
    private PDO $pdo;

    /**
     * コンストラクタ
     */
    public function __construct()
    {
        $this->pdo = Database::getInstance()->getConnection();
    }

    /**
     * 最新のベンチマーク投稿一覧を取得
     * 
     * @param int $limit 取得件数
     * @return array 投稿一覧
     */
    public function getRecent(int $limit): array
    {
        try {
            $sql = "SELECT id, user_name, comment, config_json, benchmark_result, user_agent, created_at
                    FROM posts
                    ORDER BY created_at DESC
                    LIMIT :limit";

            $stmt = $this->pdo->prepare($sql);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->execute();

            return $stmt->fetchAll();
        } catch (PDOException $e) {
            error_log('PostModel::getRecent Error: ' . $e->getMessage());
            throw new \Exception('Failed to fetch posts');
        }
    }

    /**
     * 新規投稿をDBに保存
     * 
     * @param array $data 投稿データ
     * @return bool 成功時true
     */
    public function create(array $data): bool
    {
        try {
            $sql = "INSERT INTO posts (
                        user_name, 
                        comment, 
                        config_json, 
                        benchmark_result, 
                        user_agent, 
                        created_at
                    ) VALUES (
                        :user_name, 
                        :comment, 
                        :config_json, 
                        :benchmark_result, 
                        :user_agent, 
                        NOW()
                    )";

            $stmt = $this->pdo->prepare($sql);

            $stmt->bindValue(':user_name', $data['user_name'], PDO::PARAM_STR);
            $stmt->bindValue(':comment', $data['comment'] ?? '', PDO::PARAM_STR);
            $stmt->bindValue(':config_json', $data['config_json'], PDO::PARAM_STR);
            $stmt->bindValue(':benchmark_result', $data['benchmark_result'], PDO::PARAM_STR);
            $stmt->bindValue(':user_agent', $data['user_agent'], PDO::PARAM_STR);

            return $stmt->execute();
        } catch (PDOException $e) {
            error_log('PostModel::create Error: ' . $e->getMessage());
            throw new \Exception('Failed to create post');
        }
    }
}
