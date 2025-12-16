# 詳細設計書（内部設計）：ブラウザ完結型 動画エンコードWebアプリケーション

バージョン: 1.0 (Final)

確定日: 2025年12月16日

ステータス: 確定 (実装フェーズ移行承認済)

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

## 1. Modelクラスの詳細設計とSQL定義

データアクセス層（DAO）として機能し、PDO を用いてデータベース操作をカプセル化する。

鉄の掟: 全てのSQLクエリにおいて プリペアドステートメント を使用し、SQLインジェクションを物理的に無効化する。

### 1.1 共通データベース接続クラス

* **クラス名** : `Database` (`src/Core/Database.php`)
* **役割** : データベース接続の管理（シングルトンパターン）。
* **必須設定** :
* `PDO::ATTR_ERRMODE` => `PDO::ERRMODE_EXCEPTION` （エラー時は即例外スロー）
* `PDO::ATTR_EMULATE_PREPARES` => `false` （静的プレースホルダの使用 / SQLインジェクション対策の要）
* `PDO::ATTR_DEFAULT_FETCH_MODE` => `PDO::FETCH_ASSOC` （連想配列で取得）

### 1.2 公式プリセットモデル

* **クラス名** : `PresetModel` (`src/Models/PresetModel.php`)
* **継承** : なし（またはBaseModel）

#### メソッド仕様

| **メソッド名** | **引数** | **戻り値** | **役割**                   |
| -------------------- | -------------- | ---------------- | -------------------------------- |
| `findAll`          | なし           | `array`        | 全てのプリセット設定を取得する。 |

#### 具体的なSQL文

**`findAll()`**

```
SELECT id, name, config_json 
FROM presets 
ORDER BY id ASC;

```

### 1.3 投稿・ベンチマークモデル

* **クラス名** : `PostModel` (`src/Models/PostModel.php`)

#### メソッド仕様

| **メソッド名** | **引数**  | **戻り値** | **役割**                            |
| -------------------- | --------------- | ---------------- | ----------------------------------------- |
| `getRecent`        | `int $limit`  | `array`        | 最新のベンチマーク投稿一覧を取得する。    |
| `create`           | `array $data` | `bool`         | 新規投稿をDBに保存する。成功時 `true`。 |

#### 具体的なSQL文

**`getRecent($limit)`**

* **仕様** : 最新順（降順）で取得する。`$limit` はバインドパラメータとして扱うこと。

```
SELECT id, user_name, comment, config_json, benchmark_result, user_agent, created_at
FROM posts
ORDER BY created_at DESC
LIMIT :limit;

```

**`create($data)`**

* **仕様** : `created_at` はDBの現在時刻関数を使用する。

```
INSERT INTO posts (
    user_name, 
    comment, 
    config_json, 
    benchmark_result, 
    user_agent, 
    created_at
) VALUES (
    :user_name, 
    :comment, 
    :config_json, 
    :benchmark_result, 
    :user_agent, 
    NOW()
);

```

## 2. Controllerクラスの詳細設計と責務

### 2.1 基底コントローラ (Core)

* **クラス名** : `ApiController` (`src/Core/ApiController.php`)
* **役割** :
* **CORSヘッダー送出** : コンストラクタで実行。
  * `Access-Control-Allow-Origin: *` (または特定のフロントエンドドメイン)
  * `Access-Control-Allow-Methods: GET, POST, OPTIONS`
  * `Access-Control-Allow-Headers: Content-Type`
* **共通レスポンスメソッド** :
  * `sendJson(mixed $data, int $code = 200)`: データをJSON化して出力し `exit` する。
  * `sendError(string $message, int $code = 400)`: エラーメッセージを `{"error": "msg"}` 形式で返却する。

### 2.2 プリセットコントローラ

* **クラス名** : `PresetController` (`src/Controllers/PresetController.php`)
* **継承** : `extends ApiController`

#### メソッド仕様

| **メソッド名** | **HTTP** | **処理フロー**                                                                                                                      |
| -------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `index`            | GET            | 1.`PresetModel`をインスタンス化。``2.`findAll()`を呼び出し、結果を取得。``3.`sendJson($result)`でクライアントへ返却。 |

### 2.3 投稿コントローラ

* **クラス名** : `PostController` (`src/Controllers/PostController.php`)
* **継承** : `extends ApiController`

#### メソッド仕様

| **メソッド名** | **HTTP** | **処理フロー**                                                                                                                                                                                                                                                                                                           |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index`            | GET            | 1. クエリパラメータ `limit`を取得（未指定時はデフォルト `10`、最大 `50`程度に丸める）。``2.`PostModel::getRecent($limit)`を呼び出す。``3.`sendJson($result)`で返却。                                                                                                                                   |
| `store`            | POST           | 1.`file_get_contents('php://input')`でRawデータを取得。``2.`json_decode`で配列化（失敗時は `sendError`）。``3.**`validateInput($data)`**を呼び出し検証（失敗時は `sendError`）。``4.`PostModel::create($data)`を実行。``5. 成功時、`sendJson(['message' => 'Created'], 201)`を返却。 |

## 3. セキュリティとバリデーションロジックの詳細

### 3.1 バリデーションルール定義

実装場所: PostController クラス内の private function validateInput(array $data): array

動作: エラーがあればエラーメッセージの配列を返し、問題なければ空配列を返す。

| **フィールド名** | **必須** | **型** | **制約条件・ルール**                                                                                                                                    |
| ---------------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_name`          | Yes            | string       | ・空文字禁止``・最大30文字                                                                                                                             |
| `comment`            | No             | string       | ・最大200文字（空文字は許可）                                                                                                                                 |
| `config_json`        | Yes            | string       | ・**構造検証** :`json_decode`して配列/オブジェクトになること。``・ **必須キー** :`codec`,`resolution`が含まれていること。            |
| `benchmark_result`   | Yes            | string       | ・**構造検証** :`json_decode`して配列/オブジェクトになること。``・ **必須キー** :`encode_time`,`fps`が含まれ、かつ数値型であること。 |
| `user_agent`         | Yes            | string       | ・最大255文字（改ざんによるバッファオーバーフロー攻撃予防）                                                                                                   |

### 3.2 実装場所の根拠

* **場所** : **Controller層**
* **理由** :
* **Fail Fast** : 不正なデータ形式のリクエストに対し、DB接続コストを支払う前に即座に `400 Bad Request` を返すため。
* **責務分離** : Modelは「正しいデータが渡された前提で永続化を行う」ことに専念させる。HTTPリクエストの妥当性検証はControllerの責務である。

### 3.3 セキュリティ実装方針

#### 1. SQLインジェクション対策

* **方針** : `PDO` のプリペアドステートメントを例外なく使用する。
* **禁止事項** : 変数とSQL文字列の結合（`$sql = "SELECT ... WHERE name = " . $name;`）は **厳禁** 。

#### 2. XSS (Cross-Site Scripting) 対策

* **方針** : **「保存時は生データ、表示時はクライアントサイド無害化」**
* **DB保存時** : PHP側での `htmlspecialchars` 等のサニタイズは行わない。
  *  **理由** : `config_json` などの構造化データがエスケープにより破壊され、再利用（JSONデコード）できなくなるのを防ぐため。
* **表示時** : フロントエンド（Svelte）の `{variable}` 構文による自動エスケープに委ねる。
* **禁止事項** : Svelte側での `{@html ...}` の使用を禁止する。

#### 3. パスワードハッシュ化・認証

* **方針** : **実装対象外**
* **理由** : 本システムの要件（Tier 1/Tier 2）にユーザー登録機能は含まれない。「誰でも投稿可能なオープンなナレッジベース」として設計するため、認証機能およびハッシュ化処理は不要。

#### 4. CORS (Cross-Origin Resource Sharing)

* **方針** : `ApiController` で一括制御する。
* **重要** : `OPTIONS` メソッド（プリフライトリクエスト）が飛んできた場合、ステータスコード `200` を返し、即座に `exit` する処理を入れること。これがないとPOST送信時にCORSエラーが発生する。

```
// ApiController::__construct 内のイメージ
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

```
