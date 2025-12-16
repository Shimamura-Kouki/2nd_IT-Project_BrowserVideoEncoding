# 詳細設計書（内部設計）：ブラウザ完結型 動画エンコードWebアプリケーション

バージョン: 1.1 (整合性修正版)

確定日: 2025年12月16日

ステータス: 確定 (実装フェーズ移行可)

対象: サーバーサイド実装担当者

## 0. アーキテクチャとディレクトリ構造

本システムは **MVC (Model-View-Controller)** パターンを採用するが、API専用サーバーであるため、View（HTML生成）は存在しない。JSONレスポンスがViewの役割を果たす。

### 0.1 ディレクトリ構成定義

Web公開領域（`public`）とアプリケーションロジック（`src`）を明確に分離する。

```
/project_root
  /src
    /Config
      config.php         # DB接続設定（Git管理外 / 環境変数等）
    /Core
      Database.php       # DB接続クラス（Singleton / PDOラッパー）
      ApiController.php  # 基底コントローラ（CORS, JSON応答, エラーハンドリング）
    /Models
      PresetModel.php    # プリセットデータ操作
      PostModel.php      # 投稿データ操作
    /Controllers
      PresetController.php
      PostController.php
  /public
    /api
      index.php          # フロントコントローラ（全リクエストのエントリポイント）

```

### 0.2 ルーティングとエントリポイント仕様

全てのリクエストは `public/api/index.php` が受け取り、クエリパラメータ `action` の値に基づいてコントローラを振り分ける。

* **URLパターン** : `/api/?action={action_name}`
* **ルーティングロジック (index.php)** :

```
// 疑似コード
require_once '../../src/bootstrap.php'; // オートローダー等の読み込み

header('Content-Type: application/json');
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'preset_index':
            (new PresetController())->index();
            break;
        case 'post_index':
            (new PostController())->index();
            break;
        case 'post_store':
            (new PostController())->store();
            break;
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Invalid action']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

```

## 1. Modelクラスの詳細設計とSQL定義

データアクセス層（DAOパターンに近い）として実装する。

### 1.1 `PresetModel`

* **責務** : 公式プリセット（読み取り専用）の提供。
* **テーブル定義 (`presets`)**

| **カラム名** | **型** | **制約** | **説明**                |
| ------------------ | ------------ | -------------- | ----------------------------- |
| `id`             | INT          | PK, AI         | ID                            |
| `name`           | VARCHAR(100) | NOT NULL       | 表示名（例: "YouTube 1080p"） |
| `config_json`    | JSON         | NOT NULL       | WebCodecs用設定オブジェクト   |

* **メソッド定義**
  * `getAll()`: `SELECT * FROM presets` を実行し、全件返す。

### 1.2 `PostModel`

* **責務** : ユーザー投稿データの保存と取得。
* **テーブル定義 (`posts`)**

| **カラム名**   | **型** | **制約**            | **説明**                         |
| -------------------- | ------------ | ------------------------- | -------------------------------------- |
| `id`               | INT          | PK, AI                    | ID                                     |
| `user_name`        | VARCHAR(50)  | NOT NULL                  | 投稿者名                               |
| `comment`          | TEXT         | NULL                      | ユーザーコメント                       |
| `config_json`      | JSON         | NOT NULL                  | エンコード設定（解像度、コーデック等） |
| `benchmark_result` | JSON         | NOT NULL                  | 処理時間、FPS等のスコア                |
| `user_agent`       | VARCHAR(255) | NOT NULL                  | ブラウザ・OS情報                       |
| `created_at`       | DATETIME     | DEFAULT CURRENT_TIMESTAMP | 投稿日時                               |

* **メソッド定義**
  * `getRecent(int $limit)`: `SELECT * FROM posts ORDER BY id DESC LIMIT :limit`
  * `create(array $data)`: `INSERT INTO posts (...) VALUES (...)`

## 2. Controllerクラスの詳細設計

### 2.1 `ApiController` (基底クラス)

* **共通処理** :
* **CORSヘッダー出力** : `Access-Control-Allow-Origin: *` (開発用), Methods, Headers。
* **JSON応答メソッド** : `sendJson($data, $code = 200)`。
* **リクエスト取得** : `getJSONInput()` で `php://input` をパースして配列で返す。

### 2.2 `PresetController`

* `index()`:
  1. `PresetModel->getAll()` を呼ぶ。
  2. 結果をJSONで出力する。

### 2.3 `PostController`

* `index()`:
  1. `$_GET['limit']` を取得（デフォルト10, 最大50程度に丸める）。
  2. `PostModel->getRecent($limit)` を呼ぶ。
  3. 結果をJSONで出力する。
* `store()`:
  1. `POST`メソッドであることを確認。
  2. `getJSONInput()` でJSONボディを取得。
  3. **バリデーション実行** （詳細は3.1節）。
  4. 検証OKなら `PostModel->create($data)` を呼ぶ。
  5. 成功レスポンス `{"message": "Created"}` (HTTP 201) を返す。

## 3. バリデーションとセキュリティ仕様

### 3.1 バリデーションルール (`PostController::store`)

不正なデータによるDB汚染やアプリ動作不良を防ぐため、以下の検証をパスしない場合は `400 Bad Request` を返す。

| **フィールド** | **必須** | **型/形式** | **検証詳細ルール**                                                                                                                                                      |
| -------------------- | -------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_name`        | Yes            | string            | ・1文字以上、50文字以下。``・空文字禁止。                                                                                                                              |
| `comment`          | No             | string            | ・最大1000文字。                                                                                                                                                              |
| `config_json`      | Yes            | array/object      | ・JSONとして有効な構造であること。``・ **必須キー** :`codec`,`width`,`height`が含まれていること。``・`width`,`height`は数値（整数）であること。 |
| `benchmark_result` | Yes            | array/object      | ・JSONとして有効な構造であること。``・ **必須キー** :`encode_time`,`fps`が含まれ、かつ数値型であること。                                                     |
| `user_agent`       | Yes            | string            | ・最大255文字（意図的な長文によるバッファオーバーフロー攻撃予防）。                                                                                                           |

### 3.2 実装場所の根拠

* **場所** : **Controller層**
* **理由** :
  * **Fail Fast** : 不正なデータ形式のリクエストに対し、DB接続コストを支払う前に即座に `400 Bad Request` を返すため。
  * **責務分離** : Modelは「正しいデータが渡された前提で永続化を行う」ことに専念させる。

### 3.3 セキュリティ実装方針

#### 1. SQLインジェクション対策

* **方針** : `PDO` のプリペアドステートメントを例外なく使用する。
* **禁止事項** : 変数とSQL文字列の結合（`$sql = "SELECT ... WHERE name = " . $name;`）は **厳禁** 。

#### 2. XSS (Cross-Site Scripting) 対策

* **方針** : **「保存時は生データ、表示時はクライアントサイド無害化」**
* **DB保存時** : PHP側での `htmlspecialchars` 等のサニタイズは行わない。
  * **理由** : `config_json` などの構造化データがエスケープにより破壊され、再利用（設定のコピー機能）ができなくなるため。
* **フロントエンド責務** : Svelteの `{(content)}` 記法はデフォルトでエスケープされるため、これを活用する。

## 4. APIレスポンス仕様

### 正常系

HTTP Status: `200 OK` (作成時は `201 Created`)

```
{
  "status": "success",
  "data": [ ... ]
}

```

※または単純に配列 `[...]` を返す（フロントエンドの実装簡易化のため、今回は配列直返しを許容する）。

### エラー系

HTTP Status: `4xx` or `5xx`

```
{
  "error": "エラーメッセージ詳細"
}

```
