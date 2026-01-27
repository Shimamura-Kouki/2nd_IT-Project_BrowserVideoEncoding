# Fix: Multiple Muxer Initialization Race Condition

## 問題の説明 (Problem Statement)

エンコード処理中またはエンコード終了後に以下のエラーが発生していた：

```
Uncaught Error: Cannot add new video or audio chunks after the file has been finalized.
    at jd.Ln (index-DdFDVDZC.js:8:2343)
    at jd.addVideoChunkRaw (index-DdFDVDZC.js:4:13641)
    at jd.addVideoChunk (index-DdFDVDZC.js:4:13043)
    at output (index-DdFDVDZC.js:9:43543)
```

## 根本原因 (Root Cause)

MP4Box.jsの`onReady`イベントが複数回発火する可能性があり、以下の問題が発生していた：

1. **複数のMuxerインスタンスが作成される**
   - `mp4boxfile.onReady`が複数回実行される
   - `initializeEncoders`コールバックが複数回呼ばれる
   - 毎回新しいMuxerインスタンスが作成され、古いものを上書きする

2. **エンコーダのコールバックが古いMuxerを参照する**
   - VideoEncoderとAudioEncoderの`output`コールバックは、クロージャによって作成時のMuxerインスタンスを捕捉する
   - 新しいMuxerが作成されても、コールバックは古いMuxerを参照し続ける

3. **ファイナライズ後にチャンクが追加される**
   - 古いMuxerが先にファイナライズされる
   - エンコーダのコールバックが、ファイナライズ済みのMuxerにチャンクを追加しようとする
   - エラーが発生する

### MP4Box.jsのonReadyが複数回発火する条件

- ファイルのメタデータが複数のチャンクに分散している場合
- プログレッシブローディングでファイル構造の再解析が行われる場合
- 破損したまたは非標準のMP4ファイルが処理される場合

## 実装した修正 (Solution Implemented)

### 1. encoder.js の修正

```javascript
// ガードフラグの追加
let encodersInitialized = false;

const initializeEncoders = (detectedFormat) => {
    // 複数回の初期化を防ぐ
    if (encodersInitialized) {
        console.warn('initializeEncoders called multiple times - ignoring subsequent call');
        return;
    }
    encodersInitialized = true;
    
    // ... 初期化処理
};
```

**効果：**
- `initializeEncoders`が複数回呼ばれても、2回目以降は無視される
- 単一のMuxerインスタンスのみが作成される
- すべてのエンコーダコールバックが同じMuxerを参照する

### 2. demuxer.js の修正

```javascript
// ガードフラグの追加
let readyCallbackFired = false;

mp4boxfile.onReady = (info) => {
    // 複数のonReadyイベントを防ぐ
    if (readyCallbackFired) {
        console.warn('mp4boxfile.onReady fired multiple times - ignoring subsequent call');
        return;
    }
    readyCallbackFired = true;
    
    // ... メタデータ処理
};
```

**効果：**
- ソースレベルでの防御策
- MP4Box.jsの`onReady`が複数回発火しても、2回目以降は無視される
- `initializeEncoders`が複数回呼ばれることがない

## 技術的な詳細 (Technical Details)

### 修正前の処理フロー（問題あり）

```
MP4Box.onReady (1回目)
  ↓
initializeEncoders()
  ↓
muxer = new Muxer() // Muxer A
videoEncoder.output = (chunk) => { muxer.addVideoChunk(chunk) } // Muxer A を参照
  ↓
MP4Box.onReady (2回目) ← 問題！
  ↓
initializeEncoders()
  ↓
muxer = new Muxer() // Muxer B (Muxer A を上書き)
videoEncoder.output = (chunk) => { muxer.addVideoChunk(chunk) } // まだ Muxer A を参照！
  ↓
エンコード完了
  ↓
muxer.finalize() // Muxer B をファイナライズ
  ↓
videoEncoder.flush() → output callback → Muxer A にチャンクを追加しようとする
  ↓
エラー: Muxer A は既にファイナライズ済み
```

### 修正後の処理フロー（安全）

```
MP4Box.onReady (1回目)
  ↓
readyCallbackFired = true
  ↓
initializeEncoders()
  ↓
encodersInitialized = true
  ↓
muxer = new Muxer() // 単一のMuxerインスタンス
videoEncoder.output = (chunk) => { muxer.addVideoChunk(chunk) }
  ↓
MP4Box.onReady (2回目) ← 発火しても安全
  ↓
readyCallbackFired == true なので無視される
  ↓
エンコード完了
  ↓
muxer.finalize() // 同じMuxerをファイナライズ
  ↓
すべてのチャンクが正しく追加され、エラーなし
```

## 検証結果 (Verification)

### ビルド
```bash
✓ built in 2.34s
```
- ビルド成功
- エラーなし

### コードレビュー
- レビューコメント：0件
- すべてのコメントに対応済み

### セキュリティスキャン (CodeQL)
```
Analysis Result for 'javascript'. Found 0 alerts:
- **javascript**: No alerts found.
```
- 脆弱性：0件

## 影響範囲 (Impact)

### 修正したファイル
1. `video-encoder-app/frontend/src/lib/core/encoder.js`
   - ガードフラグ`encodersInitialized`を追加
   - `initializeEncoders`に複数回呼び出しチェックを追加

2. `video-encoder-app/frontend/src/lib/core/demuxer.js`
   - ガードフラグ`readyCallbackFired`を追加
   - `mp4boxfile.onReady`に複数回発火チェックを追加

### 既存機能への影響
- なし（防御的なコード追加のみ）
- 既存の動作は変更なし
- パフォーマンスへの影響なし

## 今後の推奨事項 (Recommendations)

1. **テスト追加**
   - 複数のMP4ファイルタイプでテスト
   - 特に非標準フォーマットやフラグメント化されたメタデータを持つファイルでテスト

2. **ログ監視**
   - 本番環境で警告ログを監視
   - `initializeEncoders called multiple times`や`mp4boxfile.onReady fired multiple times`が出力される頻度を確認

3. **MP4Box.js バージョン監視**
   - MP4Box.jsの新しいバージョンで動作が変わる可能性があるため、アップデート時は注意

## まとめ (Summary)

この修正により、以下が達成された：

✅ **エラーの根本原因を特定**
- MP4Box.jsの`onReady`の複数回発火によるMuxer重複作成

✅ **2段階の防御を実装**
- Demuxerレベル：`onReady`の複数回発火を防ぐ
- Encoderレベル：`initializeEncoders`の複数回実行を防ぐ

✅ **最小限の変更**
- 既存のコードロジックは変更なし
- ガードフラグと早期リターンのみを追加

✅ **品質保証**
- ビルド成功
- コードレビュー合格
- セキュリティスキャン合格（0件の脆弱性）

エンコード処理中およびエンコード終了後に発生していた「Cannot add new video or audio chunks after the file has been finalized」エラーは、この修正により解決される。
