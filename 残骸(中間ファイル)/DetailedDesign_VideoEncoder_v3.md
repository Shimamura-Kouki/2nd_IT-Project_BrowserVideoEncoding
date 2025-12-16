# 詳細設計書（内部設計）：ブラウザ完結型 動画エンコードWebアプリケーション

 **バージョン** : 1.0

 **作成日** : 2025年12月16日

 **対象** : 開発者（実装担当）

## 0. 設計方針とアーキテクチャ概要

### 0.1 システム構成

* **アーキテクチャ** : フロントエンド（Svelte）とバックエンド（PHP）を完全に分離したSPA構成。
* **通信プロトコル** : バックエンドはHTMLを返却せず、RESTfulなJSON APIとしてのみ機能する。
* **データフロー** :
* Request: `Frontend` -> `Controller` -> `Model` -> `DB`
* Response: `DB` -> `Model` -> `Controller` (JSON) -> `Frontend`

### 0.2 ディレクトリ構造（想定）

```
/public
  /api          (APIのエントリーポイント)
    index.php   (ルーティングまたは各エンドポイントへの振り分け)
/src
  /Config
    config.php  (DB接続情報など / Git管理外)
  /Models
    Database.php
    PresetModel.php
    PostModel.php
  /Controllers
    ApiController.php
    PresetController.php
    PostController.php

```

## 1. Modelクラスの詳細設計とSQL定義

データアクセス層（DAO）として機能し、PDOを用いたデータベース操作をカプセル化する。

### 1.1 基底クラス: `Database`

* **役割** : シングルトンパターンによるDB接続管理。
* **仕様** :
* コンストラクタでPDOインスタンスを生成。
* `PDO::ATTR_ERRMODE` を `EXCEPTION` に設定（エラーハンドリングの徹底）。
* `PDO::ATTR_EMULATE_PREPARES` を `false` に設定（静的プレースホルダによるSQLインジェクション対策）。

### 1.2 `PresetModel` (公式プリセット設定)

* **役割** : エンコード設定（HQ, Low, Mobileなど）の参照。
* **テーブル** : `presets`

| **メソッド名** | **引数** | **戻り値** | **概要**                       |
| -------------------- | -------------- | ---------------- | ------------------------------------ |
| **findAll**    | なし           | `array`        | 全てのプリセットレコードを取得する。 |

* **具体的なSQL文 (`findAll`)** :

```
  SELECT id, name, config_json, description 
  FROM presets 
  ORDER BY id ASC;

```

### 1.3 `PostModel` (ユーザー投稿・ベンチマーク)

* **役割** : ユーザーによるベンチマーク結果の保存と一覧取得。
* **テーブル** : `posts`

| **メソッド名** | **引数**   | **戻り値** | **概要**                                                                                                                |
| -------------------- | ---------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **create**     | `$data`(array) | `bool`         | 投稿データを新規作成する。``引数配列キー:`user_name`,`comment`,`config_json`,`benchmark_result`,`user_agent` |
| **getRecent**  | `$limit`(int)  | `array`        | 最新の投稿を指定件数分取得する。                                                                                              |

* **具体的なSQL文 (`create`)** :

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

* ※ `:config_json` 等のJSONカラムには、PHP側で `json_encode` 済みの文字列ではなく、JSON文字列そのものを渡す（フロントから送られてきたJSON文字列をバリデーション後にそのまま格納）。
* **具体的なSQL文 (`getRecent`)** :

```
  SELECT 
      id, 
      user_name, 
      comment, 
      config_json, 
      benchmark_result, 
      created_at 
  FROM posts 
  ORDER BY created_at DESC 
  LIMIT :limit;

```

* ※ `:limit` は `PDO::PARAM_INT` としてバインドすること。

## 2. Controllerクラスの詳細設計と責務

ユーザー入力の受付、検証、Model呼び出し、JSONレスポンス生成を担当する。

### 2.1 基底クラス: `ApiController`

* **役割** : 全コントローラーの親クラス。共通処理を集約。
* **メソッド** :
* `__construct()`: CORSヘッダー (`Access-Control-Allow-Origin: *`) の送出。`OPTIONS`メソッド（プリフライトリクエスト）への200 OK応答と終了処理。
* `sendJson($data, $code = 200)`: データをJSON形式で出力し、`exit`する。
* `sendError($message, $code = 400)`: エラー時の統一フォーマット `{"error": "message"}` を出力し、`exit`する。

### 2.2 `PresetController`

* **役割** : プリセット情報の提供。

| **メソッド名**  | **HTTP** | **処理フロー**                                                                               |
| --------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| **indexAction** | GET            | 1.`PresetModel::findAll()`を呼び出す。``2. 取得した配列を `sendJson($data)`で返却する。 |

### 2.3 `PostController`

* **役割** : 投稿の受付と一覧表示。

| **メソッド名**  | **HTTP** | **処理フロー**                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **indexAction** | GET            | 1. クエリパラメータ `limit`を取得 (未指定時はデフォルト `10`、最大 `50`程度に丸める)。``2.`PostModel::getRecent($limit)`を呼び出す。``3. 結果を `sendJson($data)`で返却する。                                                                                                                                                                                                  |
| **storeAction** | POST           | 1.`file_get_contents('php://input')`からリクエストボディ（JSON）を取得。``2.`json_decode`で配列化（失敗時は `sendError`）。``3.**`validateInput($input)`**を呼び出し、入力値を検証。``4. バリデーション失敗時は `sendError($errors, 422)`。``5.`PostModel::create($input)`を呼び出す。``6. 成功時は `sendJson(['message' => 'Success'], 201)`を返却。 |

## 3. セキュリティとバリデーションロジックの詳細

### 3.1 バリデーション設計

本システムは小規模なAPIサーバーであるため、バリデーションロジックは **Controller層 (`PostController`) のプライベートメソッド** として実装することを推奨する。

* **理由** : 複雑なビジネスルール（Service層が必要なレベル）が存在せず、リクエストパラメータの形式チェックが主であるため、Controller内で完結させることで可読性を高める。

#### **主要バリデーションルール (`validateInput` メソッド)**

| **フィールド** | **必須** | **ルール・仕様**                                                                                                                                                 |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_name`        | Yes            | ・文字列長: 1文字以上、30文字以下``・空白のみは不可                                                                                                             |
| `comment`          | No             | ・文字列長: 200文字以下``・`null`の場合は空文字として扱う                                                                                                     |
| `config_json`      | Yes            | ・**JSON妥当性** :`json_decode`が成功すること``・ **構造チェック** : デコード結果に必須キー `codec`,`resolution`が含まれていること            |
| `benchmark_result` | Yes            | ・**JSON妥当性** :`json_decode`が成功すること``・ **構造チェック** : デコード結果に必須キー `encode_time`,`fps`が含まれ、かつ数値型であること |
| `user_agent`       | Yes            | ・文字列長: 255文字以下 (DBカラム定義に合わせる)                                                                                                                       |

### 3.2 セキュリティ実装

#### **1. SQLインジェクション対策**

* **実装場所** : `Database.php` および 各Modelクラス
* **手法** :
* `Database.php` にて `PDO::ATTR_EMULATE_PREPARES => false` を設定し、DBドライバネイティブのプリペアドステートメントを強制する。
* Modelクラスでは、ユーザー入力値を含むすべてのクエリに対してプレースホルダ (`:value`) を使用し、絶対に変数展開 (`$sql = "SELECT... $id"`) を行わない。

#### **2. XSS (クロスサイトスクリプティング) 対策**

* **実装場所** : フロントエンド (Svelte) および API仕様策定
* **手法** :
* **入力/保存時** : PHP側ではHTMLタグの除去やサニタイズを行わず、**生データ（Raw Data）としてDBに保存**する。これは、「エンコード設定」などのJSONデータが破壊されるのを防ぐためである。
* **出力時** : APIはJSONとしてそのまま出力する（`Content-Type: application/json`）。
* **表示時 (重要)** : Svelte側の責務として、変数の出力には `{variable}` (自動エスケープ) を使用する。意図的にHTMLを出力する `{@html}` ディレクティブは、ユーザー投稿コンテンツ（コメント等）に対して**使用禁止**とする。

#### **3. パスワードハッシュ化について**

* **方針** : **実装対象外**
* **理由** : 本システムの基本設計要件（Tier 1/Tier 2）において、ユーザー登録・ログイン機能は定義されていない（誰でも投稿可能なナレッジベース形式）。認証情報（パスワード）自体を取り扱わないため、`password_hash()` 等の実装は不要である。
* *補足* : 将来的に管理画面（不適切な投稿の削除など）を実装する場合は、`admin_users` テーブルを作成し、その際に `password_hash()` によるハッシュ化を行う。

#### **4. CORS (Cross-Origin Resource Sharing) 対策**

* **実装場所** : `ApiController.php` (`__construct`)
* **手法** :
* フロントエンドとバックエンドのドメイン（ポート）が異なる開発環境を想定し、アクセス許可ヘッダーを付与する。
* プリフライトリクエスト (`OPTIONS`) に対する適切なハンドリングを実装し、POST送信時のCORSエラーを回避する。

```
// ApiController.php での実装例
header("Access-Control-Allow-Origin: *"); // 本番環境ではフロントエンドのURLを指定することを推奨
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

```

```

### 修正・精査のポイント
* **SQL定義**: プレースホルダ (`:name`) を使った完全なSQL文を記述し、PHP変数の埋め込みがないことを明確にしました。
* **バリデーション**: `config_json` や `benchmark_result` が単なる文字列ではなく「特定のキーを持つJSON」であることをチェックするロジック（構造チェック）を追加し、データの整合性を担保しました。
* **セキュリティ**: 「ログイン機能がない」という要件に基づき、パスワードハッシュ化は不要であると明記しました。これにより、不要な実装工数を削減します。

この設計書で実装フェーズへ進んで問題ありません。

```
