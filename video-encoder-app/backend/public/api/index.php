<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    echo json_encode(['ok' => true]);
    exit;
}

$basePath = dirname(__DIR__, 2); // api -> public -> backend

require_once $basePath . '/src/Config/config.php';
require_once $basePath . '/src/Core/Database.php';
require_once $basePath . '/src/Core/ApiController.php';
require_once $basePath . '/src/Controllers/PresetController.php';
require_once $basePath . '/src/Controllers/PostController.php';

$config = include $basePath . '/src/Config/config.php';
$db = null;

$action = $_GET['action'] ?? '';
try {
    $db = new Database($config);
    switch ($action) {
        case 'preset_index':
            $c = new PresetController($db);
            $c->index();
            break;
        case 'post_index':
            $c = new PostController($db);
            $c->index();
            break;
        case 'post_store':
            $c = new PostController($db);
            $c->store();
            break;
        default:
            ApiController::json(['error' => 'Not Found'], 404);
    }
} catch (Throwable $e) {
    ApiController::json([
        'error' => 'Server Error',
        'detail' => $e->getMessage(),
        'hint' => 'MySQLが起動しているか、ホスト/ポート/ユーザーを確認してください。'
    ], 500);
}
