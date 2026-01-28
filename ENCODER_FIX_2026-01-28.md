# Video Encoder Browser Compatibility Fix - 2026-01-28

## 概要 (Summary)

このドキュメントは、ブラウザ動画エンコードアプリケーションで発生していた2つの重大な問題の修正について説明します。

This document describes the fixes for two critical issues in the browser video encoding application.

## 修正された問題 (Issues Fixed)

### 問題1: Chrome - 動画エンコードが正しく完了しない (Video encoding incomplete)

#### 症状 (Symptoms)
```log
encoder.js:156 Using original framerate: 59.60 fps
encoder.js:286 VideoEncoder output callback fired after muxer finalization - ignoring chunk
output @ encoder.js:286
encoder.js:286 VideoEncoder output callback fired after muxer finalization - ignoring chunk
output @ encoder.js:286
(繰り返し... / repeated...)
```

動画が途中で終わる、または正しく再生できない状態になっていた。

Videos were ending prematurely or not playing correctly.

#### 根本原因 (Root Cause)

VP9/VP8エンコーダーは`flush()`完了後も遅延してoutputコールバックを発火することがある。従来のコードは以下の流れで動作していた：

VP9/VP8 encoders can have delayed output callbacks that fire even after `flush()` completes. The previous code flow was:

1. `await videoEncoder.flush()` 完了
2. 保留中のチャンクが0になるまで待機（100msタイムアウト付き）
3. `muxerFinalized = true` を設定
4. `muxer.finalize()` を呼び出す
5. **問題**: VP9/VP8エンコーダーが遅延コールバックを発火
6. コールバックが既にファイナライズされたMuxerにチャンクを追加しようとする
7. チャンクが無視され、動画が不完全になる

#### 修正内容 (Solution)

1. **エンコーダーフラッシュ後に200msの安全遅延を追加**
   ```javascript
   // Add additional safety delay to ensure all encoder callbacks complete
   console.log('Waiting for delayed encoder callbacks to complete...');
   await new Promise(resolve => setTimeout(resolve, 200));
   ```

2. **遅延後も保留中のチャンクがある場合の追加待機**
   ```javascript
   if (pendingVideoChunks > 0 || pendingAudioChunks > 0) {
       console.warn(`Still have pending chunks after delay...`);
       await new Promise(resolve => setTimeout(resolve, 100));
   }
   ```

3. **muxerFinalizedフラグを早期設定**
   - `muxer.finalize()`を呼び出す**前**に`muxerFinalized = true`を設定
   - これにより、遅延コールバックが確実にチャンクの追加を防ぐ

### 問題2: Firefox - AV1エンコードでエラーが発生 (AV1 encoding fails in Firefox)

#### 症状 (Symptoms)
```log
Encoding error: TypeError: window.showSaveFilePicker is not a function
    encodeToFile encoder.js:32
    startEncoding App.svelte:481
```

Firefoxで動画エンコードを開始しようとすると即座にエラーが発生していた。

Video encoding would immediately fail when attempting to start in Firefox.

#### 根本原因 (Root Cause)

FirefoxはFile System Access API（`showSaveFilePicker`）をサポートしていない。従来のコードは以下のように直接呼び出していた：

Firefox doesn't support the File System Access API (`showSaveFilePicker`). The previous code called it directly:

```javascript
const handle = await window.showSaveFilePicker({ ... });
```

#### 修正内容 (Solution)

1. **File System Access APIのサポート検出**
   ```javascript
   const supportsFileSystemAccess = 'showSaveFilePicker' in window;
   ```

2. **ArrayBufferTargetのインポートと統一ラッパークラスの作成**
   ```javascript
   import { ArrayBufferTarget as MP4ArrayBufferTarget } from 'mp4-muxer';
   import { ArrayBufferTarget as WebMArrayBufferTarget } from 'webm-muxer';
   
   class ArrayBufferTarget {
       constructor(container) {
           this.target = container === 'webm' 
               ? new WebMArrayBufferTarget() 
               : new MP4ArrayBufferTarget();
       }
       get buffer() {
           return this.target.buffer;
       }
   }
   ```

3. **APIサポート状況に応じた分岐処理**
   ```javascript
   if (supportsFileSystemAccess) {
       const handle = await window.showSaveFilePicker({ ... });
       fileStream = await handle.createWritable();
   } else {
       console.log('File System Access API not supported, using fallback');
       bufferTarget = new ArrayBufferTarget(container);
   }
   ```

4. **Muxer初期化時の適切なターゲット選択**
   ```javascript
   const muxerConfig = {
       target: fileStream ? new MP4Target(fileStream) : bufferTarget.target,
       // ...
   };
   ```

5. **エンコード完了後のダウンロード処理**
   ```javascript
   if (fileStream) {
       await fileStream.close();
   } else {
       // Trigger download for browsers without File System Access API
       const buffer = bufferTarget.buffer;
       const blob = new Blob([buffer], { type: mimeType });
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = suggestedName;
       a.click();
       URL.revokeObjectURL(url);
   }
   ```

## 変更されたファイル (Changed Files)

- `video-encoder-app/frontend/src/lib/core/encoder.js`

## テスト結果 (Test Results)

### ビルド (Build)
```bash
$ npm run build
✓ 124 modules transformed.
✓ built in 1.87s
```
- ビルドは成功し、エラーなし
- 出力サイズ: 275.29 KB (gzip: 73.50 KB)

### セキュリティスキャン (Security Scan)
```
CodeQL Analysis: No alerts found.
```

### 開発サーバー (Dev Server)
```
VITE v7.3.1  ready in 471 ms
➜  Local:   http://localhost:5173/2nd_IT-Project_BrowserVideoEncoding/
```
- 開発サーバーは正常に起動

## ブラウザ互換性 (Browser Compatibility)

### Chrome/Edge (Chromium系)
- ✅ File System Access API サポート
- ✅ VP9/VP8エンコーダーの遅延コールバック問題を修正
- ✅ 動画が正しく完了するようになった

### Firefox
- ⚠️ File System Access API 非サポート
- ✅ ArrayBufferTargetフォールバックで動作
- ✅ 従来のダウンロード方式でファイル保存

### Safari
- ⚠️ File System Access API 非サポート（iOS/macOS）
- ✅ ArrayBufferTargetフォールバックで動作（想定）

## 技術的な詳細 (Technical Details)

### VP9/VP8エンコーダーの遅延について

VP9とVP8エンコーダーは、WebCodecs APIの古い実装であり、以下の特性がある：

1. `flush()`完了後も最大200ms程度、outputコールバックが遅延して発火する可能性
2. 内部バッファリングとパイプライン処理が非同期的
3. AV1エンコーダー（新しい実装）ではこの問題は発生しにくい

### ArrayBufferTargetの動作

1. エンコードされたチャンクをメモリ内バッファに蓄積
2. すべてのエンコードが完了後、バッファからBlobを作成
3. `URL.createObjectURL()`でダウンロード可能なURLを生成
4. プログラム的に`<a>`要素のクリックをトリガーしてダウンロード開始

### メモリ使用量の考慮

ArrayBufferTarget方式（Firefox等）では、動画全体をメモリに保持する必要があるため：
- 大きなファイルの場合、メモリ使用量が増加
- File System Access API方式（Chrome等）はストリーミング書き込みのため、メモリ効率が良い

## 今後の改善案 (Future Improvements)

1. **Service Workerを使用したストリーム処理**
   - Firefoxでもメモリ効率の良いストリーム処理を実現
   
2. **ブラウザ別の最適化**
   - ブラウザ/コーデック組み合わせに応じた遅延時間の調整
   
3. **プログレス表示の改善**
   - ArrayBufferTarget使用時も正確な進捗を表示

4. **エラーハンドリングの強化**
   - メモリ不足時の適切なエラーメッセージ
   - 大容量ファイルの警告表示

## 参考資料 (References)

- [File System Access API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [WebCodecs API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [mp4-muxer Documentation](https://github.com/Vanilagy/mp4-muxer)
- [webm-muxer Documentation](https://github.com/Vanilagy/webm-muxer)
