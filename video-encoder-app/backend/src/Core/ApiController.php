<?php
class ApiController
{
    protected $db;
    public function __construct(Database $db)
    {
        $this->db = $db;
    }
    public static function json($data, $status = 200)
    {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}
