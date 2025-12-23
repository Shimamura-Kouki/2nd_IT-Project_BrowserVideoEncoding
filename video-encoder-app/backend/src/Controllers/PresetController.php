<?php
class PresetController extends ApiController
{
    public function index()
    {
        $stmt = $this->db->pdo()->query('SELECT id, name, config_json, created_at FROM presets ORDER BY id');
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['config_json'] = json_decode($r['config_json'], true);
        }
        self::json($rows);
    }
}
