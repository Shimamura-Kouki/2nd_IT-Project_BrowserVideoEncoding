<?php

/**
 * 投稿コントローラクラス
 * 
 * ベンチマーク投稿のAPI エンドポイントを提供する。
 */

namespace App\Controllers;

use App\Core\ApiController;
use App\Models\PostModel;

class PostController extends ApiController
{
    /**
     * 投稿一覧を取得 (GET /api/posts)
     */
    public function index(): void
    {
        $this->requireMethod('GET');

        try {
            // クエリパラメータからlimitを取得（デフォルト10、最大50）
            $limit = (int)($_GET['limit'] ?? 10);
            $limit = max(1, min($limit, 50)); // 1〜50の範囲に制限

            $model = new PostModel();
            $result = $model->getRecent($limit);

            $this->sendJson($result);
        } catch (\Exception $e) {
            error_log('PostController::index Error: ' . $e->getMessage());
            // 開発環境: 詳細エラーを表示（本番環境では元に戻す）
            $this->sendError('Failed to fetch posts: ' . $e->getMessage(), 500);
        }
    }

    /**
     * 新規投稿を作成 (POST /api/posts)
     */
    public function store(): void
    {
        $this->requireMethod('POST');

        try {
            // Rawデータを取得してJSONデコード
            $rawData = file_get_contents('php://input');
            $data = json_decode($rawData, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                $this->sendError('Invalid JSON format');
                return;
            }

            // バリデーション
            $errors = $this->validateInput($data);
            if (!empty($errors)) {
                $this->sendError(implode(', ', $errors), 400);
                return;
            }

            // モデルに渡すデータを準備
            $postData = [
                'user_name' => $data['user_name'],
                'comment' => $data['comment'] ?? '',
                'config_json' => json_encode($data['config_json'], JSON_UNESCAPED_UNICODE),
                'benchmark_result' => json_encode($data['benchmark_result'], JSON_UNESCAPED_UNICODE),
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown'
            ];

            $model = new PostModel();
            $success = $model->create($postData);

            if ($success) {
                $this->sendJson(['message' => 'Post created successfully'], 201);
            } else {
                $this->sendError('Failed to create post', 500);
            }
        } catch (\Exception $e) {
            error_log('PostController::store Error: ' . $e->getMessage());
            $this->sendError('Failed to create post', 500);
        }
    }

    /**
     * 入力データのバリデーション
     * 
     * @param array $data 検証するデータ
     * @return array エラーメッセージの配列（エラーがない場合は空配列）
     */
    private function validateInput(array $data): array
    {
        $errors = [];

        // user_name: 必須、最大30文字
        if (empty($data['user_name'])) {
            $errors[] = 'user_name is required';
        } elseif (mb_strlen($data['user_name']) > 30) {
            $errors[] = 'user_name must be 30 characters or less';
        }

        // comment: 最大200文字（任意）
        if (isset($data['comment']) && mb_strlen($data['comment']) > 200) {
            $errors[] = 'comment must be 200 characters or less';
        }

        // config_json: 必須、構造検証
        if (empty($data['config_json'])) {
            $errors[] = 'config_json is required';
        } elseif (!is_array($data['config_json'])) {
            $errors[] = 'config_json must be an object or array';
        } else {
            // 必須キーの確認
            if (!isset($data['config_json']['codec'])) {
                $errors[] = 'config_json must contain "codec" key';
            }
            if (!isset($data['config_json']['resolution'])) {
                $errors[] = 'config_json must contain "resolution" key';
            }
        }

        // benchmark_result: 必須、構造検証
        if (empty($data['benchmark_result'])) {
            $errors[] = 'benchmark_result is required';
        } elseif (!is_array($data['benchmark_result'])) {
            $errors[] = 'benchmark_result must be an object or array';
        } else {
            // 必須キーの確認
            if (!isset($data['benchmark_result']['encode_time'])) {
                $errors[] = 'benchmark_result must contain "encode_time" key';
            } elseif (!is_numeric($data['benchmark_result']['encode_time'])) {
                $errors[] = 'encode_time must be numeric';
            }

            if (!isset($data['benchmark_result']['fps'])) {
                $errors[] = 'benchmark_result must contain "fps" key';
            } elseif (!is_numeric($data['benchmark_result']['fps'])) {
                $errors[] = 'fps must be numeric';
            }
        }

        return $errors;
    }
}
