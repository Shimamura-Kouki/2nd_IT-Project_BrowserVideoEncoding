# 詳細設計書（内部設計）v2：ブラウザ完結型 動画エンコードWebアプリケーション

## 0. 設計の前提

本システムはフロントエンド（Svelte）とバックエンド（PHP）が分離したSPA（Single Page Application）構成である。

PHPアプリケーションはView（HTML）を返却せず、JSON形式のAPIレスポンスのみを担当する。

## 1. 共通基盤・設定設計

### 1.1 設定ファイル (Config)

機密情報（DB接続情報）をコードから分離するため、設定ファイルを導入する。

Git管理外とする config.php を作成し、定数または配列として定義する。

* **ファイル名** : `config.php` (Git除外)
* **内容** :
* `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`

### 1.2 Base Model (Database.php)

データベース接続ロジックを共通化するシングルトンクラス。

* **クラス名** : `Database.php`
* **役割** :
  * DB接続の確立（PDOを使用）。
  * **重要** : `PDO::ATTR_ERRMODE` を `PDO::ERRMODE_EXCEPTION` に設定し、SQLエラー時に必ず例外を発生させる。
  * `PDO::ATTR_EMULATE_PREPARES` を `false` にし、SQLインジェクション対策を盤石にする。

```
// 実装イメージ
class Database {
    private static $instance = null;
    private $pdo;

    private function __construct() {
        // config.phpの定数を使用
        $dsn = "mysql:host=".DB_HOST.";dbname=".DB_NAME.";charset=utf8mb4";
        $this->pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]);
    }
  
    public static function getInstance() { ... }
    public function getConnection() { return $this->pdo; }
}


```

## 2. Modelクラスの詳細設計とSQL定義

### 2.1 PresetModel (公式設定プリセット)

* **クラス名** : `PresetModel.php`
* **役割** : エンコード設定（HQ, Low, Mobileなど）の読み出し。

|

| メソッド名 | 引数 | 戻り値 | 仕様概要 |

| findAll | なし | array | 全てのプリセットを取得する。 |

* **具体的なSQL文 (`findAll`)** :
  ```
  SELECT id, name, config_json, description FROM presets ORDER BY id ASC


  ```

### 2.2 PostModel (ユーザー投稿・ベンチマーク)

* **クラス名** : `PostModel.php`
* **役割** : ベンチマーク結果の保存と一覧取得。

| メソッド名 | 引数 | 戻り値 | 仕様概要 |

| create | $data(array) | bool | 投稿データをDBに挿入する。  引数:user_name,comment,config_json,benchmark_result,user_agent |

| getRecent | $limit(int) | array | 最新の投稿を指定件数分取得する。 |

| getTopSpeed | $limit(int) | array | 処理速度順に取得する（ランキング用）。benchmark_result内の数値をパースしてソートするのではなく、SQLで簡易的に扱うか、登録時にスコア専用カラムを持たせるか検討するが、MVPではcreated_at順を基本とする。 |

* **具体的なSQL文 (`create`)** :

  * `created_at` はMySQLの `NOW()` 関数を使用。

  ```
  INSERT INTO posts (
      user_name, comment, config_json, benchmark_result, user_agent, created_at
  ) VALUES (
      :user_name, :comment, :config_json, :benchmark_result, :user_agent, NOW()
  )


  ```
* **具体的なSQL文 (`getRecent`)** :

  ```
  SELECT id, user_name, comment, config_json, benchmark_result, created_at 
  FROM posts 
  ORDER BY created_at DESC 
  LIMIT :limit


  ```

## 3. Controllerクラスの詳細設計と責務

### 3.1 Base Controller (ApiController.php)

全Controllerの親クラス。共通処理を集約する。

* **クラス名** : `ApiController.php`
* **メソッド** :
* `__construct()`: CORSヘッダーの設定 (`Access-Control-Allow-Origin: *` 等)。
* `sendJson($data, $code=200)`: データをJSONエンコードして出力し、処理を終了(`exit`)する。
* `sendError($message, $code=400)`: エラーメッセージを統一フォーマット `{"error": "..."}` で出力し、終了する。

### 3.2 PresetController (プリセット取得系)

* **クラス名** : `PresetController.php` (extends `ApiController`)

| メソッド名 | HTTP | 処理フロー |

| index | GET | 1. PresetModel::findAll() 呼び出し。  2. 取得データを sendJson($data) で返却。 |

### 3.3 PostController (投稿・閲覧系)

* **クラス名** : `PostController.php` (extends `ApiController`)

| メソッド名 | HTTP | 処理フロー |

| index | GET | 1. クエリパラメータ limit 取得 (default: 10)。  2. PostModel::getRecent($limit) 呼び出し。  3. sendJson($data) で返却。 |

| store | POST | 1. php://input からJSON取得。  2. json_decode 実行（失敗時 sendError('Invalid JSON')）。  3. validateInput($input) 実行（失敗時 sendError($errors)）。  4. PostModel::create($input) 実行。  5. 成功時 sendJson(['message' => 'Success'], 201)。 |

## 4. セキュリティとバリデーション

### 4.1 バリデーションルール (PostController::validateInput)

`store` メソッド内で呼び出すプライベートメソッド。違反がある場合はエラー配列を返す。

| フィールド | 必須 | ルール詳細 |

| user_name | Yes | ・文字列長 1〜30文字 |

| comment | No | ・文字列長 0〜200文字 |

| config_json | Yes | ・JSON文字列として有効か (json_decode 成功)  ・追加: 必須キー codec, resolution が含まれているか確認 |

| benchmark_result | Yes | ・JSON文字列として有効か  ・追加: 必須キー encode_time, fps が含まれ、数値であるか確認 |

| user_agent | Yes | ・文字列長 255文字以下 |

### 4.2 セキュリティ実装方針

1. **XSS対策** :

* 保存時: 生データのままDB保存（加工しない）。
* 出力時: JSONとしてそのまま出力。
* 表示時 (Frontend): Svelteの標準バインディング `{}` を使用し、自動エスケープさせる。`{@html}` は使用禁止。
* 例外: PHPからHTMLエラーを返す場合のみ `htmlspecialchars` を使用。

1. **SQLインジェクション対策** :

* `Database.php` で `PDO::ATTR_EMULATE_PREPARES => false` を設定。
* 全てのクエリでプレースホルダ (`:name`) を使用する。

1. **CORS対策** :

* `ApiController` コンストラクタでヘッダー出力。
* `OPTIONS` メソッドのリクエスト（プリフライトリクエスト）が来た場合、ステータス200を返して即終了する処理を追加（これをしないとPOSTが失敗することがある）。

```
// ApiController内でのCORS & プリフライト処理例
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}


```
