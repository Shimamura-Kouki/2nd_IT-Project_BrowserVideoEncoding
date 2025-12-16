# 詳細設計書（内部設計）：ブラウザ完結型 動画エンコードWebアプリケーション

## 0. 設計の前提

本システムはフロントエンド（Svelte）とバックエンド（PHP）が分離したSPA（Single Page Application）構成である。

PHPアプリケーションはView（HTML）を返却せず、JSON形式のAPIレスポンスのみを担当する。

## 1. Modelクラスの詳細設計とSQL定義

データベース接続には `PDO (PHP Data Objects)` を使用し、すべてのSQL実行においてプリペアドステートメントを徹底することでSQLインジェクションを防ぐ。

### 1.1 Base Model (抽象クラス)

データベース接続ロジックを共通化するため、親クラスを設ける。

* **クラス名** : `Database.php` (または `AppModel.php`)
* **役割** : DB接続の確立（SingletonパターンまたはDI推奨）

### 1.2 PresetModel (公式設定プリセット)

* **クラス名** : `PresetModel.php`
* **役割** : 管理者が用意したエンコード設定（HQ, Low, Mobileなど）の読み出し。

| **メソッド名** | **引数**   | **戻り値**     | **仕様概要**                       |
| -------------- | ---------- | -------------- | ---------------------------------- |
| `findAll`      | なし       | `array`        | 全てのプリセットを取得する。       |
| `findById`     | `$id`(int) | `array\|false` | 指定IDのプリセット詳細を取得する。 |

* **具体的なSQL文 (`findAll`)** :

```sql
  SELECT id, name, config_json, description
  FROM presets
  ORDER BY id ASC

```

### 1.3 PostModel (ユーザー投稿・ベンチマーク)

* **クラス名** : `PostModel.php`
* **役割** : ユーザーからのベンチマーク結果投稿の保存と、一覧取得。

| **メソッド名** | **引数**       | **戻り値** | **仕様概要**                                                                                                          |
| -------------- | -------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `create`       | `$data`(array) | `bool`     | 投稿データをDBに挿入する。`$data`には `user_name`,`comment`,`config_json`,`benchmark_result`,`user_agent`が含まれる。 |  |  |
| `getRecent`    | `$limit`(int)  | `array`    | 最新の投稿を指定件数分取得する。                                                                                      |
| `getTopSpeed`  | `$limit`(int)  | `array`    | 処理速度（FPS等）が速い順に取得する（ランキング用）。                                                                 |

* **具体的なSQL文 (`create`)** :

```sql
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
  )

```

* **具体的なSQL文 (`getRecent`)** :

```sql
  SELECT id, user_name, comment, config_json, benchmark_result, created_at 
  FROM posts 
  ORDER BY created_at DESC 
  LIMIT :limit

```

## 2. Controllerクラスの詳細設計と責務

PHPはREST APIとして動作するため、Controllerは「リクエストの受信 → 検証 → Model実行 → JSON返却」のフローを担当する。共通処理としてCORSヘッダーの付与やJSONエンコード処理を行う親クラス `ApiController` を継承する形とする。

### 2.1 PresetController (プリセット取得系)

* **クラス名** : `PresetController.php`

| **メソッド名** | **HTTPメソッド** | **仕様・処理フロー**                                                                                           |
| -------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `index`        | `GET`            | **[始]**リクエスト受信``**[処]** `PresetModel::findAll()`を呼び出し``**[終]**結果をJSON形式で出力 (`HTTP 200`) |

### 2.2 PostController (投稿・閲覧系)

* **クラス名** : `PostController.php`

| **メソッド名** | **HTTPメソッド** | **仕様・処理フロー**                                                                                                                                                                                                                                                       |
| -------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index`        | `GET`            | **[始]**クエリパラメータ `sort`(new/speed) を確認``**[処]** `sort`の値に応じて `PostModel::getRecent()`または `getTopSpeed()`を呼び出し``**[終]**投稿リストをJSONで出力 (`HTTP 200`)                                                                                       |
| `store`        | `POST`           | **[始]** `php://input`からJSONデータを受信・デコード``**[処1]**バリデーション実行（後述の検証ロジック呼び出し）``**[処2]**失敗時はエラー内容をJSONで返却 (`HTTP 400`)``**[処3]**成功時は `PostModel::create($data)`を実行``**[終]**成功ステータスをJSONで返却 (`HTTP 201`) |

## 3. セキュリティとバリデーションロジックの詳細

本システムはユーザー入力をそのまま公開する機能を持つため、XSS対策および不正データ混入防止が重要となる。

### 3.1 主要バリデーションルール (PostController::store)

APIが受け取るJSONデータに対するバリデーションルール。

| **フィールド名**   | **必須** | **型**     | **ルール詳細**                                                                           |
| ------------------ | -------- | ---------- | ---------------------------------------------------------------------------------------- |
| `user_name`        | Yes      | String     | ・最大文字数：30文字``・空文字禁止                                                       |
| `comment`          | No       | String     | ・最大文字数：200文字``・(任意項目だが長さ制限は設ける)                                  |
| `config_json`      | Yes      | JSON/Array | ・有効なJSON文字列であること``・必須キー（codec, bitrate等）が含まれているか簡易チェック |
| `benchmark_result` | Yes      | JSON/Array | ・有効なJSON文字列であること``・数値が負でないこと（duration > 0）                       |
| `user_agent`       | Yes      | String     | ・最大文字数：255文字（DBカラム制限に合わせる）                                          |

### 3.2 実装場所の提言

**提言：Controller層（または専用のValidatorクラス）で実行する**

* **理由** :

1. **Fail Fast（早期失敗）** : 不正なデータはModel（DB操作）に到達する前に弾くべきである。無駄なDB接続を防ぎ、アプリケーションのパフォーマンスを維持するため。
2. **責務の分離** : Modelは「データの永続化」に集中し、Controller（API層）は「HTTPリクエストの正当性」を保証するという役割分担がMVCにおいて明確であるため。
3. 今回は小規模開発であるため、`PostController` 内にプライベートメソッド `validateInput($data)` を作成し、そこで検証を行う実装が最もコストパフォーマンスが良い。

### 3.3 セキュリティ実装詳細

#### XSS（クロスサイトスクリプティング）対策

本アプリはJSON APIであるため、PHP側でHTMLエスケープをしてDBに保存する手法（Sanitize）と、生データを保存してフロントエンド表示時にエスケープする手法がある。今回はSvelteの自動エスケープ機能を活かすため、**「生データを保存し、フロントエンドで防ぐ」**方針とするが、念の為の多重防御を行う。

* **実装場所** : `PostController.php` (出力直前) または フロントエンド
* **具体的関数** :
* Svelteはデフォルトで `{var}` 記法がエスケープされるため安全。
* もしPHP側でエラーメッセージなどをHTMLとして返す必要がある場合は `htmlspecialchars($string, ENT_QUOTES, 'UTF-8')` を必須とする。

#### SQLインジェクション対策

* **実装場所** : `Model` クラス全般
* **具体的関数** : `PDO::prepare()` と `PDOStatement::execute()` を使用する。
* **絶対禁止事項** : 変数を直接SQL文字列に結合すること。
* 例: `OK: VALUES (:name)`, `NG: VALUES ('" . $name . "')`

#### CORS (Cross-Origin Resource Sharing) 対策

フロントエンド（開発サーバー等）とバックエンドのドメイン/ポートが異なる場合に通信がブロックされるのを防ぐ。

* **実装場所** : `ApiController` (親クラス) のコンストラクタ または `index.php` (エントリポイント)
* **具体的コード** :

```php
  header("Access-Control-Allow-Origin: *"); // 本番では特定のドメインに絞ることを推奨
  header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
  header("Access-Control-Allow-Headers: Content-Type");

```

#### JSONデコードエラー処理

不正なJSONがPOSTされた場合にPHPがWarningを出さないよう処理する。

* **実装場所** : `PostController::store` 冒頭
* **具体的コード** :

```php
  $input = json_decode(file_get_contents('php://input'), true);
  if (json_last_error() !== JSON_ERROR_NONE) {
      http_response_code(400);
      echo json_encode(['error' => 'Invalid JSON']);
      exit;
  }

```
