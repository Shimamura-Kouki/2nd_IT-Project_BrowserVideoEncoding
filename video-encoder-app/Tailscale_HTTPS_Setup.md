# Tailscale HTTPS開発環境セットアップガイド

## 問題の説明

デバッグ時にTailscaleアドレスでアクセスしようとすると「このサイトにアクセスできません」というエラーが発生する問題を修正しました。

## 解決方法

### 1. Tailscale証明書の取得

```bash
# Tailscale証明書を取得
tailscale cert <your-hostname>.ts.net
```

証明書は以下の場所に保存されます:
- **Linux/Mac**: `/var/lib/tailscale/certs/`
- **Windows**: `%ProgramData%\Tailscale\certs\`

### 2. .env.localファイルの作成

```bash
# プロジェクトディレクトリに移動
cd video-encoder-app/frontend

# テンプレートをコピー
cp .env.local.example .env.local
```

### 3. .env.localの編集

以下のように証明書のパスを設定:

```env
SSL_KEY_PATH=/var/lib/tailscale/certs/<your-hostname>.ts.net.key
SSL_CERT_PATH=/var/lib/tailscale/certs/<your-hostname>.ts.net.crt
```

**Windows の場合:**
```env
SSL_KEY_PATH=C:\ProgramData\Tailscale\certs\<your-hostname>.ts.net.key
SSL_CERT_PATH=C:\ProgramData\Tailscale\certs\<your-hostname>.ts.net.crt
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

成功すると以下のメッセージが表示されます:

```
✅ HTTPS enabled with certificates from .env.local
   Key: /var/lib/tailscale/certs/<your-hostname>.ts.net.key
   Cert: /var/lib/tailscale/certs/<your-hostname>.ts.net.crt

  ➜  Local:   https://localhost:5173/
  ➜  Network: https://10.x.x.x:5173/
```

### 5. アクセス

ブラウザで以下のアドレスにアクセス:

```
https://<your-hostname>.ts.net:5173
```

## トラブルシューティング

### エラー: "SSL certificate paths are set but files not found"

**原因**: 証明書ファイルのパスが間違っている

**解決方法**:
```bash
# 証明書ファイルの存在を確認
ls -l /var/lib/tailscale/certs/

# .env.localのパスを修正
```

### エラー: "このサイトにアクセスできません"

**チェック項目**:

1. **サーバーが起動しているか確認**
   ```bash
   npm run dev
   ```
   
2. **HTTPSが有効か確認**
   - ログに「✅ HTTPS enabled」が表示されているか

3. **証明書の有効期限を確認**
   ```bash
   openssl x509 -in /var/lib/tailscale/certs/<your-hostname>.ts.net.crt -noout -dates
   ```

4. **証明書を再取得**
   ```bash
   tailscale cert --force <your-hostname>.ts.net
   ```

5. **ファイアウォールを確認**
   - ポート5173が開いているか確認

### HTTPモードで起動したい場合

`.env.local`ファイルを削除またはリネームすると、HTTPモードで起動します:

```bash
mv .env.local .env.local.backup
npm run dev
```

## 改善内容

### Before (以前)

- ❌ 特定のホスト名のみ許可（ハードコード）
- ❌ 設定方法の説明がない
- ❌ エラーメッセージが不明確
- ❌ HTTPに自動フォールバック（HTTPSではアクセス不可）

### After (改善後)

- ✅ すべての`.ts.net`ドメインを許可
- ✅ 詳細なセットアップガイド
- ✅ わかりやすいエラーメッセージ（日本語・英語）
- ✅ 証明書パスの表示
- ✅ トラブルシューティング手順

## 参考リンク

- [Tailscale HTTPS証明書の取得方法](https://tailscale.com/kb/1153/enabling-https)
- [WebCodecs API - セキュアコンテキスト要件](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
