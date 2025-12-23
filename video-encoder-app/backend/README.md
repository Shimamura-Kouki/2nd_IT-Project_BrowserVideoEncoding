# Backend (PHP/MySQL)

## セットアップ
1. MySQLに`database.sql`を適用:
   ```sql
   SOURCE database.sql;
   ```
2. `src/Config/config.php` でDB接続情報を環境に合わせて変更。
3. Apacheのドキュメントルート配下に `public/` を配置し、`public/api/index.php` が `/api/` として到達できるようにする。

## エンドポイント
- `GET /api/?action=preset_index`
- `GET /api/?action=post_index&limit=10`
- `POST /api/?action=post_store` (JSONボディ: 設計書参照)

## セキュリティ/実装メモ
- すべてPDOのプリペアドステートメント使用。
- 動画等のバイナリは受け付けない。JSONのみ。
- CORS: `Access-Control-Allow-Origin: *` を付与済み。
