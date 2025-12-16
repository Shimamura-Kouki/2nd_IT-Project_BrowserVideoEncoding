<?php

/**
 * プリセットモデルクラス
 * 
 * 公式プリセットデータへのアクセスを提供する。
 */

namespace App\Models;

use App\Core\Database;
use PDO;
use PDOException;

class PresetModel
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
     * 全てのプリセット設定を取得
     * 
     * @return array プリセット一覧
     */
    public function findAll(): array
    {
        try {
            $sql = "SELECT id, name, config_json 
                    FROM presets 
                    ORDER BY id ASC";

            $stmt = $this->pdo->prepare($sql);
            $stmt->execute();

            return $stmt->fetchAll();
        } catch (PDOException $e) {
            error_log('PresetModel::findAll Error: ' . $e->getMessage());
            throw new \Exception('Failed to fetch presets');
        }
    }
}
