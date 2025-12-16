<?php

/**
 * API基底コントローラクラス
 * 
 * 全てのAPIコントローラが継承する基底クラス。
 * CORS制御、JSON応答、エラーハンドリングを提供する。
 */

namespace App\Core;

class ApiController
{
    /**
     * コンストラクタ
     * CORSヘッダーの設定とプリフライトリクエストの処理
     */
    public function __construct()
    {
        $this->setCorsHeaders();
        $this->handlePreflight();
    }

    /**
     * CORSヘッダーを設定
     */
    protected function setCorsHeaders(): void
    {
        // 本番環境では特定のオリジンに制限することを推奨
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Content-Type: application/json; charset=utf-8');
    }

    /**
     * プリフライトリクエスト(OPTIONS)を処理
     * 
     * ブラウザがPOSTリクエストを送信する前にOPTIONSリクエストを送る。
     * これに対して200を返さないとCORSエラーが発生する。
     */
    protected function handlePreflight(): void
    {
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(200);
            exit;
        }
    }

    /**
     * JSONレスポンスを送信
     * 
     * @param mixed $data レスポンスデータ
     * @param int $code HTTPステータスコード
     */
    protected function sendJson($data, int $code = 200): void
    {
        http_response_code($code);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }

    /**
     * エラーレスポンスを送信
     * 
     * @param string $message エラーメッセージ
     * @param int $code HTTPステータスコード
     */
    protected function sendError(string $message, int $code = 400): void
    {
        $this->sendJson(['error' => $message], $code);
    }

    /**
     * HTTPメソッドのチェック
     * 
     * @param string $method 許可するHTTPメソッド
     */
    protected function requireMethod(string $method): void
    {
        if ($_SERVER['REQUEST_METHOD'] !== $method) {
            $this->sendError('Method Not Allowed', 405);
        }
    }
}
