<?php

/**
 * プリセットコントローラクラス
 * 
 * プリセット設定のAPI エンドポイントを提供する。
 */

namespace App\Controllers;

use App\Core\ApiController;
use App\Models\PresetModel;

class PresetController extends ApiController
{
    /**
     * プリセット一覧を取得 (GET /api/presets)
     */
    public function index(): void
    {
        $this->requireMethod('GET');

        try {
            $model = new PresetModel();
            $result = $model->findAll();

            $this->sendJson($result);
        } catch (\Exception $e) {
            error_log('PresetController::index Error: ' . $e->getMessage());
            // 開発環境: 詳細エラーを表示（本番環境では元に戻す）
            $this->sendError('Failed to fetch presets: ' . $e->getMessage(), 500);
        }
    }
}
