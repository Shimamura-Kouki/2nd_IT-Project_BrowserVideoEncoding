<?php

/**
 * フロントコントローラ
 * 
 * 全てのAPIリクエストのエントリポイント。
 * ルーティングを行い、適切なコントローラとメソッドを呼び出す。
 * 
 * エンドポイント:
 * - GET  /api/presets     -> PresetController::index
 * - GET  /api/posts       -> PostController::index
 * - POST /api/posts       -> PostController::store
 */

// オートローダーの設定
spl_autoload_register(function ($class) {
    // 名前空間のプレフィックスを除去
    $prefix = 'App\\';
    $base_dir = __DIR__ . '/../../src/';

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';

    if (file_exists($file)) {
        require $file;
    }
});

// エラーハンドリング
set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    error_log("Error [$errno]: $errstr in $errfile on line $errline");
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error']);
    exit;
});

set_exception_handler(function ($exception) {
    error_log('Uncaught Exception: ' . $exception->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error']);
    exit;
});

// リクエストURIとメソッドを取得
$requestUri = $_SERVER['REQUEST_URI'];
$requestMethod = $_SERVER['REQUEST_METHOD'];

// .htaccessからのクエリパラメータを優先使用
if (isset($_GET['path'])) {
    $path = $_GET['path'];
} else {
    // クエリパラメータを除去
    $path = parse_url($requestUri, PHP_URL_PATH);

    // パスから不要な部分を除去して正規化
    // 例: /最終成果物作成プロジェクト/video-encoder-api/public/api/presets -> presets
    $path = basename(dirname($path)) === 'api' ? basename($path) : $path;
    $path = preg_replace('#^.*/(api/)?#', '', $path);
    $path = preg_replace('#/index\.php$#', '', $path);
    $path = preg_replace('#^index\.php$#', '', $path);
}
$path = trim($path, '/');

// ルーティング
try {
    switch ($path) {
        case 'presets':
            $controller = new \App\Controllers\PresetController();
            $controller->index();
            break;

        case 'posts':
            $controller = new \App\Controllers\PostController();
            if ($requestMethod === 'GET') {
                $controller->index();
            } elseif ($requestMethod === 'POST') {
                $controller->store();
            } else {
                http_response_code(405);
                echo json_encode(['error' => 'Method Not Allowed']);
            }
            break;

        case '':
            // トップページ（APIルートへのアクセス）
            http_response_code(200);
            echo json_encode([
                'message' => 'Video Encoder API Server',
                'version' => 'alpha',
                'endpoints' => [
                    'GET /api/presets' => 'プリセット一覧取得',
                    'GET /api/posts?limit=10' => '投稿一覧取得',
                    'POST /api/posts' => '新規投稿作成'
                ]
            ]);
            break;

        default:
            http_response_code(404);
            echo json_encode(['error' => 'Not Found']);
            break;
    }
} catch (\Exception $e) {
    error_log('Routing Error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error']);
}
