# 「このサイトにアクセスできません」クイック解決ガイド

## 症状
サーバーログには以下が表示されているのに、ブラウザでアクセスできない:
```
✅ HTTPS enabled with certificates from .env.local
➜  Local:   https://thinkbook-14-g6-windows.bass-uaru.ts.net:5173/
```

ブラウザで `https://thinkbook-14-g6-windows.bass-uaru.ts.net:5173/` にアクセスすると:
```
このサイトにアクセスできません
thinkbook-14-g6-windows.bass-uaru.ts.net にタイプミスがないか確認してください。
```

## 🚀 即座に試すべきこと（重要度順）

### 1️⃣ ローカルホストで試す（最優先）
```
https://localhost:5173/
```
✅ これで動けば → サーバーと証明書は正常。問題はDNS解決。
❌ これでも動かなければ → 証明書またはサーバーの問題。

### 2️⃣ ローカルIPアドレスで試す
サーバーログに表示されているIPアドレスを使用:
```
https://192.168.50.223:5173/
```
⚠️ 証明書エラーが出ますが、「詳細設定」→「安全ではないサイトに進む」で続行可能。

### 3️⃣ Tailscale magic DNSを確認
```powershell
tailscale status
```
出力に `MagicDNS: enabled` があるか確認。

### 4️⃣ 証明書を再取得
```powershell
tailscale cert --force thinkbook-14-g6-windows.bass-uaru.ts.net
```
その後、サーバーを再起動:
```powershell
npm run dev
```

### 5️⃣ ブラウザのキャッシュをクリア
- Chrome: Ctrl+Shift+Delete → 「キャッシュされた画像とファイル」をクリア
- Edge: Ctrl+Shift+Delete → 「キャッシュされた画像とファイル」をクリア

## 🔍 原因別の詳細解決方法

### 原因A: DNS解決の問題（最も多い）

**症状:**
- `https://localhost:5173/` は動く
- `https://thinkbook-14-g6-windows.bass-uaru.ts.net:5173/` は動かない

**解決方法:**

1. Tailscale magic DNSを有効化:
   - https://login.tailscale.com/admin/dns にアクセス
   - "MagicDNS" を有効化

2. Windows DNS キャッシュをクリア:
   ```powershell
   ipconfig /flushdns
   ```

3. hostsファイルに手動追加（一時的）:
   ```powershell
   # 管理者としてメモ帳を起動
   notepad C:\Windows\System32\drivers\etc\hosts
   
   # 以下を追加（IPアドレスは tailscale status で確認）
   100.x.x.x thinkbook-14-g6-windows.bass-uaru.ts.net
   ```

### 原因B: 証明書のホスト名不一致

**確認方法:**
```powershell
openssl x509 -in C:\Users\kouki\thinkbook-14-g6-windows.bass-uaru.ts.net.crt -text -noout | Select-String "DNS:"
```

出力例:
```
DNS:thinkbook-14-g6-windows.bass-uaru.ts.net
```

ホスト名が一致しない場合、証明書を再取得:
```powershell
# 古い証明書を削除
del C:\Users\kouki\thinkbook-14-g6-windows.bass-uaru.ts.net.*

# 新しい証明書を取得
tailscale cert thinkbook-14-g6-windows.bass-uaru.ts.net

# サーバー再起動
npm run dev
```

### 原因C: 証明書の有効期限切れ

**確認方法:**
```powershell
openssl x509 -in C:\Users\kouki\thinkbook-14-g6-windows.bass-uaru.ts.net.crt -noout -dates
```

期限切れの場合:
```powershell
tailscale cert --force thinkbook-14-g6-windows.bass-uaru.ts.net
```

### 原因D: Tailscale接続の問題

**確認方法:**
```powershell
tailscale status
```

`active` と表示されていない場合:
```powershell
tailscale up
```

## 📱 別のデバイスからアクセスする場合

同じTailscaleネットワーク内の別のデバイス（スマホなど）からアクセスする場合:

1. Tailscaleが両方のデバイスで起動しているか確認
2. `tailscale status` で接続を確認
3. 別のデバイスでも `https://thinkbook-14-g6-windows.bass-uaru.ts.net:5173/` にアクセス

⚠️ 証明書エラーが出る場合、一時的に無視して進む（開発環境のみ）

## 🆘 それでもダメな場合

### オプション1: HTTP モードで起動

```powershell
# .env.local をリネーム
ren .env.local .env.local.backup

# HTTPモードで起動
npm run dev

# アクセス
# http://thinkbook-14-g6-windows.bass-uaru.ts.net:5173/
```

⚠️ 注意: WebCodecs APIはセキュアコンテキスト必須のため、HTTPでは一部機能が動作しない可能性があります。

### オプション2: ポート転送を使用

```powershell
# 別のポートでHTTPサーバーを起動し、
# リバースプロキシを経由してHTTPSアクセス
# （上級者向け）
```

## 📚 詳細情報

- 完全なトラブルシューティング: `Tailscale_HTTPS_Setup.md`
- セットアップ手順: `frontend/README.md`
- Tailscale公式: https://tailscale.com/kb/1153/enabling-https

## ✅ 成功時の表示

正しく動作している場合、ブラウザで以下が表示されます:
- アドレスバーに 🔒 マーク
- Developer Tools (F12) の Console に "HTTPS enabled" 関連メッセージ
- アプリケーションが正常に動作

## 🎯 推奨: 最終的な解決策

開発環境では、最も確実な方法は:
1. **ローカルホスト使用**: `https://localhost:5173/`
2. **ローカルIP使用**: `https://192.168.x.x:5173/` （証明書警告を無視）

本番環境や他のデバイスからのアクセスが必要な場合のみ、Tailscale DNSの完全な設定を行ってください。
