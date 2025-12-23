<?php
class PostController extends ApiController
{
    public function index()
    {
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
        if ($limit <= 0 || $limit > 100) {
            $limit = 10;
        }
        $sql = 'SELECT id, user_name, comment, config_json, benchmark_result, user_agent, created_at FROM posts ORDER BY created_at DESC LIMIT :limit';
        $stmt = $this->db->pdo()->prepare($sql);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['config_json'] = json_decode($r['config_json'], true);
            $r['benchmark_result'] = json_decode($r['benchmark_result'], true);
        }
        self::json($rows);
    }

    public function store()
    {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            self::json(['error' => 'Invalid JSON'], 400);
        }

        $userName = trim($input['user_name'] ?? '');
        if ($userName === '' || mb_strlen($userName) > 50) {
            self::json(['error' => 'user_name is required (<=50 chars)'], 400);
        }

        $configJson = $input['config_json'] ?? null;
        $benchmark = $input['benchmark_result'] ?? null;
        if ($configJson === null || $benchmark === null) {
            self::json(['error' => 'config_json and benchmark_result are required'], 400);
        }

        $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? ($input['user_agent'] ?? ''), 0, 255);

        $stmt = $this->db->pdo()->prepare('INSERT INTO posts (user_name, comment, config_json, benchmark_result, user_agent) VALUES (:user_name, :comment, :config_json, :benchmark_result, :user_agent)');
        $stmt->bindValue(':user_name', $userName, PDO::PARAM_STR);
        $stmt->bindValue(':comment', $input['comment'] ?? '', PDO::PARAM_STR);
        $stmt->bindValue(':config_json', json_encode($configJson, JSON_UNESCAPED_UNICODE), PDO::PARAM_STR);
        $stmt->bindValue(':benchmark_result', json_encode($benchmark, JSON_UNESCAPED_UNICODE), PDO::PARAM_STR);
        $stmt->bindValue(':user_agent', $userAgent, PDO::PARAM_STR);
        $stmt->execute();

        self::json(['message' => 'Created', 'id' => (int)$this->db->pdo()->lastInsertId()], 201);
    }
}
