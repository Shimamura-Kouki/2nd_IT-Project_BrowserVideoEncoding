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

### エラー: "このサイトにアクセスできません" (サーバーは起動しているのにアクセスできない)

このエラーが出る場合、サーバーは正常に起動していますが、ブラウザが接続できない状態です。

**状況の確認:**
サーバーログに以下が表示されていれば、サーバー自体は正常です:
```
✅ HTTPS enabled with certificates from .env.local
➜  Local:   https://thinkbook-14-g6-windows.bass-uaru.ts.net:5173/
```

**原因と解決方法:**

#### 1. DNS解決の問題（最も多い原因）

Tailscaleホスト名がブラウザで解決できない可能性があります。

**解決方法A: ローカルホストでアクセス**
```
https://localhost:5173/
```
これで動作すれば、証明書とサーバーは正常です。

**解決方法B: ローカルIPアドレスでアクセス**
サーバーログに表示されているIPアドレスを使用:
```
https://192.168.x.x:5173/
```
⚠️ 注意: IPアドレスでアクセスすると証明書エラーが出ますが、開発環境では「詳細設定」→「安全ではないサイトに進む」で続行できます。

**解決方法C: Tailscaleのmagic DNSを有効化**
```powershell
# Windows PowerShell
tailscale status
# "MagicDNS: enabled" と表示されるか確認

# 無効の場合、Tailscale管理画面で有効化
# https://login.tailscale.com/admin/dns
```

#### 2. 証明書のホスト名不一致

証明書のCommon Name (CN)またはSANが正しいか確認:

**Windows (PowerShell):**
```powershell
# 証明書の詳細を確認
openssl x509 -in C:\Users\kouki\thinkbook-14-g6-windows.bass-uaru.ts.net.crt -text -noout | Select-String "Subject:|DNS:"

# 出力例:
# Subject: CN=thinkbook-14-g6-windows.bass-uaru.ts.net
# DNS:thinkbook-14-g6-windows.bass-uaru.ts.net
```

**Linux/Mac:**
```bash
openssl x509 -in /var/lib/tailscale/certs/<hostname>.ts.net.crt -text -noout | grep -A1 "Subject Alternative Name"
```

ホスト名が一致しない場合、証明書を再取得:
```powershell
tailscale cert --force thinkbook-14-g6-windows.bass-uaru.ts.net
```

#### 3. ブラウザの証明書エラー

**Chrome/Edgeの場合:**
1. DevToolsを開く (F12)
2. Consoleタブで赤いエラーを確認
3. Securityタブで証明書の状態を確認

**よくある証明書エラー:**
- `NET::ERR_CERT_AUTHORITY_INVALID` → 証明書の信頼に問題がある。Tailscale証明書は通常Let's Encryptから発行されますが、証明書チェーンに問題がある場合があります。証明書を再取得してください。
- `NET::ERR_CERT_COMMON_NAME_INVALID` → ホスト名が証明書と一致していない。上記の解決方法2を参照。
- `NET::ERR_CERT_DATE_INVALID` → 証明書の有効期限が切れている。証明書を再取得してください。

**一時的な解決方法:**
開発環境では、証明書警告を無視して進めます:
1. エラー画面で「詳細設定」をクリック
2. 「安全ではないサイトに進む」をクリック

⚠️ 注意: 本番環境では証明書エラーを無視せず、適切に修正してください。

#### 4. Tailscaleの接続状態確認

```powershell
# Tailscaleの状態確認
tailscale status

# 出力例:
# 100.x.x.x    thinkbook-14-g6-windows  your-email@  windows active; ...
```

`active`と表示されていない場合:
```powershell
tailscale up
```

#### 5. 証明書の有効期限確認

Tailscale証明書は90日で期限切れになります:

**Windows:**
```powershell
openssl x509 -in C:\Users\kouki\thinkbook-14-g6-windows.bass-uaru.ts.net.crt -noout -dates
```

**Linux/Mac:**
```bash
openssl x509 -in /var/lib/tailscale/certs/<hostname>.ts.net.crt -noout -dates
```

期限切れの場合、再取得:
```powershell
tailscale cert --force thinkbook-14-g6-windows.bass-uaru.ts.net
```

#### 6. ファイアウォール確認

Windowsファイアウォールでポート5173が許可されているか確認:

```powershell
# PowerShellで確認（管理者権限で実行）
Get-NetFirewallRule | Get-NetFirewallPortFilter | Where-Object {$_.LocalPort -eq 5173}

# または、GUIで確認
# 「Windows Defender ファイアウォール」を開く
# 「詳細設定」→「受信の規則」でポート5173を確認

# ポート5173を許可する（必要な場合）
New-NetFirewallRule -DisplayName "Vite Dev Server" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
```

**注意:** 通常、localhostへのアクセスはファイアウォールで遮断されません。ファイアウォールが問題になるのは、別のデバイスからアクセスする場合のみです。

#### 推奨: まず試すべき順序

1. ✅ `https://localhost:5173/` でアクセス → 動けば証明書は正常
2. ✅ Tailscale statusを確認 → activeであることを確認
3. ✅ 証明書を再取得 → `tailscale cert --force <hostname>`
4. ✅ ブラウザのキャッシュをクリア
5. ✅ それでもダメなら、ローカルIPアドレスで試す

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
