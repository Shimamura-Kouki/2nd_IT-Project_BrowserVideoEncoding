# ブラウザ互換性ガイド

このドキュメントでは、ブラウザ完結型動画エンコードアプリのブラウザ互換性について説明します。

## 📊 ブラウザ対応状況

### ✅ 完全対応（推奨）

| ブラウザ | バージョン | 動作状況 | 推奨度 |
|---------|----------|---------|-------|
| Google Chrome | 94以上 | ✅ 完全動作 | ⭐⭐⭐ 最推奨 |
| Microsoft Edge | 94以上 | ✅ 完全動作 | ⭐⭐⭐ 最推奨 |
| Brave | 94以上 | ✅ 完全動作 | ⭐⭐ 推奨 |
| Vivaldi | 94以上 | ✅ 完全動作 | ⭐⭐ 推奨 |
| その他Chromium系 | 94以上 | ✅ 完全動作 | ⭐⭐ 推奨 |

### ⚠️ 非推奨

| ブラウザ | バージョン | 動作状況 | 既知の問題 |
|---------|----------|---------|----------|
| Firefox | すべて | ❌ 問題あり | WebCodecs API実装に不具合 |

### ❓ 未検証

| ブラウザ | バージョン | 動作状況 | 備考 |
|---------|----------|---------|------|
| Safari | 16.4以上 | ❓ 不明 | WebCodecs対応だが未検証 |

## 🔍 Firefoxの既知の問題

Firefoxでは、WebCodecs APIの実装に問題があり、以下のような症状が発生します：

### AV1コーデック
- **症状**: エンコードが100%完了しない
- **詳細**: 96.7%程度で停止し、残りのチャンクが失われる
- **結果**: 不完全な動画ファイルが生成される
- **影響**: シーク時のエラー、動画の途中で終了

### VP9コーデック
- **症状**: エンコードが100%完了しない
- **詳細**: AV1と同様の問題が発生
- **結果**: 不完全な動画ファイルが生成される

### H.264コーデック
- **症状**: 各種エラーが発生する可能性
- **詳細**: コーデック実装に問題
- **結果**: エンコード失敗またはエラー

### 根本原因

FirefoxのWebCodecs API実装には以下の問題があると考えられます：

1. **エンコーダーの非同期処理の不具合**
   - チャンクの生成タイミングが不安定
   - 最後の数%のチャンクが生成されない
   - フラッシュ処理が正しく完了しない

2. **メモリ管理の問題**
   - 長時間のエンコードでチャンクが失われる
   - バッファリングの問題

3. **ブラウザの実装差異**
   - ChromiumとFirefoxでWebCodecs実装が異なる
   - Firefoxの実装が仕様に完全準拠していない

## 📝 テスト結果

### Chrome（完全動作）

```log
Using original framerate: 59.60 fps
Waiting for all encoder chunks to complete...
Expected frames: 1069
✓ Audio encoder started producing chunks
✓ Video encoder started producing chunks
No new chunks for 500ms, encoding complete
Final state: video chunks=1069, audio chunks=898
Video chunk coverage: 1069/1069 (100.0%)

=== Encoding Performance Metrics ===
Total encoding time: 33.37s
Average FPS: 32.0 fps
```

- ✅ 100%完了
- ✅ 全チャンク正常に処理
- ✅ 高速エンコード（平均32fps）

### Firefox（問題あり）

```log
Using original framerate: 59.60 fps
Waiting for all encoder chunks to complete...
Expected frames: 1069
✓ Audio encoder started producing chunks
✓ Video encoder started producing chunks
Still encoding: 1034/1069 chunks (96.7%), waiting for 99%+...
Encoding appears stalled - no chunks for 60.0s
Final state: video chunks=1034, audio chunks=897
Only received 1034/1069 chunks (96.7%) before stall
```

- ❌ 96.7%で停止
- ❌ 35チャンク（3.3%）が失われる
- ❌ 極端に遅い（平均5fps程度）

## 🛠️ 回避策

現時点でFirefoxでの完全な動作を保証する方法はありません。以下の対応を推奨します：

### ユーザー向け推奨

1. **Google ChromeまたはMicrosoft Edgeを使用する**
   - 最も確実な解決策
   - 最新版を使用することを推奨

2. **Firefoxを使用する場合の注意点**
   - エンコードが完了しない可能性を理解する
   - 重要な動画には使用しない
   - 出力ファイルを必ず確認する

### 開発者向け対策

以下の対策を実装済み：

1. **ブラウザ検出と警告**
   - Firefoxユーザーに警告を表示
   - 推奨ブラウザを案内

2. **タイムアウト調整**
   - 60秒のストールタイムアウト
   - Firefoxの遅いエンコードに対応

3. **チャンク追跡**
   - 詳細なチャンクカウント
   - 進捗状況の可視化

4. **ドキュメント整備**
   - README に明記
   - トラブルシューティングガイド

## 📚 参考情報

### WebCodecs API対応状況

- **Chrome/Edge**: 94以降で完全対応
- **Firefox**: 実装はあるが不完全
- **Safari**: 16.4以降で対応（未検証）

### 関連リンク

- [WebCodecs API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [Can I use WebCodecs](https://caniuse.com/webcodecs)
- [Chromium WebCodecs Implementation](https://chromestatus.com/feature/5669293909868544)

## 🔄 今後の対応

### 短期的対応（完了）

- ✅ ブラウザ検出と警告表示
- ✅ ドキュメント整備
- ✅ トラブルシューティングガイド

### 中長期的対応（検討中）

- ⏳ Firefoxへの正式なバグレポート
- ⏳ Safari での動作検証
- ⏳ 代替エンコード手法の検討
- ⏳ ブラウザ別の最適化

## 💡 結論

**推奨事項:**

1. **Google Chrome または Microsoft Edge の最新版を使用する**
   - 最も確実で高速
   - 全機能が正常に動作

2. **Firefoxは使用しない**
   - 既知の問題があり、正常に動作しない
   - エンコードが不完全になる

3. **Safariは自己責任で**
   - 動作する可能性はあるが未検証
   - 問題が発生した場合はChromeを使用

このアプリは **Chromiumベースのブラウザ** での使用を前提として開発されています。最適な体験のため、推奨ブラウザをご使用ください。
