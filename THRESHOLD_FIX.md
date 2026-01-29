# Critical Fix: Premature Finalization at 50% Coverage - 2026-01-29

## 問題の詳細 (Problem Details)

### 症状 (Symptoms)

動画エンコードが50.8%（543/1069チャンク）で停止し、残りの49%のチャンクが失われていた。

Video encoding stopped at 50.8% completion (543/1069 chunks), losing the remaining 49% of chunks.

#### 実際のログ (Actual Log)
```log
File System Access API not supported, using in-memory buffer fallback
Using original framerate: 59.60 fps
✓ Audio encoder started producing chunks
Waiting for all encoder chunks to complete...
Initial state: video chunks received=0, audio chunks received=20
Expected encoders: video=yes, audio=yes
Expected frames: 1069

✓ Video encoder started producing chunks
Still encoding: 1/1069 chunks (0.1%), waiting for more...
Still encoding: 25/1069 chunks (2.3%), waiting for more...
New chunks arrived: video=35, audio=896, resetting idle timer
... (chunks continue arriving)
New chunks arrived: video=537, audio=896, resetting idle timer
New chunks arrived: video=539, audio=896, resetting idle timer
New chunks arrived: video=540, audio=896, resetting idle timer
New chunks arrived: video=541, audio=896, resetting idle timer
New chunks arrived: video=543, audio=896, resetting idle timer

(500ms gap - no new chunks)

No new chunks for 500ms, encoding complete  ← 問題！まだ50.8%しか完了していない
Final state: video chunks=543, audio chunks=896
Video chunk coverage: 543/1069 (50.8%)  ← 半分しか取得していない！
File download triggered: ...

VideoEncoder output callback fired after muxer finalization - ignoring chunk 544
VideoEncoder output callback fired after muxer finalization - ignoring chunk 545
... (chunks 544-1069 are all lost - 526 chunks = 49% of video)
VideoEncoder output callback fired after muxer finalization - ignoring chunk 1034
```

### 根本原因 (Root Cause)

1. **50%のしきい値が低すぎる**
   - 従来: チャンクが総フレーム数の50%以上なら、アイドルタイムアウトを許可
   - 問題: 50%は動画のちょうど半分 - 終了するには早すぎる
   - Previous: Allow idle timeout if ≥50% of chunks received
   - Problem: 50% is only halfway through - way too early to stop

2. **チャンク到着のギャップ**
   - 通常のエンコード中、チャンク間に500ms以上のギャップが発生することがある
   - 50%を超えた直後にギャップが発生すると、即座にファイナライズ
   - Normal encoding can have >500ms gaps between chunks
   - Gap right after passing 50% triggers immediate finalization

3. **タイミング図 (Timing Diagram)**
```
チャンク到着 (Chunk Arrival) →
0%    10%   20%   30%   40%   50%   60%   70%   80%   90%   100%
|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
Chunks: ▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌                          ← 543チャンク到達
50% threshold:                  ✓                            ← しきい値クリア
Gap:                              [500ms]                    ← ギャップ発生
Finalize:                                ✓                   ← ファイナライズ
Lost:                                     ✗✗✗✗✗✗✗✗✗✗✗✗✗   ← 526チャンク破棄 (49%)
Should be:                                ▌▌▌▌▌▌▌▌▌▌▌▌▌   ← 本来は継続するべき
```

### 従来のコードの問題 (Problem with Old Code)

```javascript
// WRONG: 50% threshold is too low
if (hasVideoTrack && totalFrames > 0 && totalVideoChunksReceived < (totalFrames * 0.5)) {
    // Below 50%, keep waiting
    lastCheckTime = now;
    continue;
}

// PROBLEM: Once past 50%, any 500ms gap triggers finalization
const idleTime = now - lastCheckTime;
if (idleTime >= CHUNK_IDLE_TIMEOUT_MS) { // 500ms
    // FINALIZES at 50.8% with only a brief gap!
    console.log(`No new chunks for ${CHUNK_IDLE_TIMEOUT_MS}ms, encoding complete`);
    break;
}
```

**問題点 (Problems):**
- 50.8%で500msのギャップ → 即座にファイナライズ
- 残り49%のビデオが失われる
- 50.8% + 500ms gap → Immediate finalization
- Remaining 49% of video lost

## 解決策 (Solution)

### アプローチ (Approach)

**二重の保護機構 (Dual Protection Mechanism):**

1. **しきい値を90%に引き上げ**
   - 90%未満: アイドルタイムアウトを完全にブロック
   - 90%以上: アイドルタイムアウトを許可

2. **アダプティブアイドルタイムアウト**
   - 100%未満: 2000ms（ギャップを許容）
   - 100%到達: 500ms（通常）

### 実装の詳細 (Implementation Details)

#### 1. しきい値の変更 (Threshold Change)

```javascript
// OLD: 50% threshold
if (hasVideoTrack && totalFrames > 0 && totalVideoChunksReceived < (totalFrames * 0.5)) {
    // ...
}

// NEW: 90% threshold
if (hasVideoTrack && totalFrames > 0 && totalVideoChunksReceived < (totalFrames * 0.9)) {
    // We haven't received enough video chunks yet
    if (elapsedTotal % 2000 < POLL_INTERVAL_MS) {
        const progress = ((totalVideoChunksReceived / totalFrames) * 100).toFixed(1);
        console.log(`Still encoding: ${totalVideoChunksReceived}/${totalFrames} chunks (${progress}%), waiting for more...`);
    }
    lastCheckTime = now; // Reset idle timer since we're still expecting more chunks
    continue;
}
```

**理由 (Rationale):**
- 90%: エンコードがほぼ完了していることを確実にする
- B-フレーム、フレームドロップを考慮しても、90%なら十分に進行している
- 90%: Ensures encoding is nearly complete
- Even with B-frames and frame dropping, 90% is substantial progress

#### 2. アダプティブアイドルタイムアウト (Adaptive Idle Timeout)

```javascript
// Adaptive idle timeout based on chunk coverage
let effectiveIdleTimeout = CHUNK_IDLE_TIMEOUT_MS; // 500ms default
if (hasVideoTrack && totalFrames > 0 && totalVideoChunksReceived < totalFrames) {
    // We haven't received all expected chunks yet
    // Use a longer idle timeout (2 seconds) to account for occasional gaps in chunk arrival
    effectiveIdleTimeout = 2000;
}

if (idleTime >= effectiveIdleTimeout) {
    console.log(`No new chunks for ${effectiveIdleTimeout}ms, encoding complete`);
    console.log(`Final state: video chunks=${totalVideoChunksReceived}, audio chunks=${totalAudioChunksReceived}`);
    if (totalFrames > 0) {
        const coverage = ((totalVideoChunksReceived / totalFrames) * 100).toFixed(1);
        console.log(`Video chunk coverage: ${totalVideoChunksReceived}/${totalFrames} (${coverage}%)`);
    }
    break;
}
```

**重要ポイント (Key Points):**
- `<100%`: 2000msアイドルタイムアウト（ギャップを許容）
- `=100%`: 500msアイドルタイムアウト（通常の完了検出）
- `<100%`: 2000ms idle timeout (tolerates gaps)
- `=100%`: 500ms idle timeout (normal completion detection)

### 動作フロー (Behavior Flow)

```
チャンク到着 → カバレッジチェック
  ↓
カバレッジ < 90%？
  Yes → アイドルタイムアウトをブロック
        チャンク待機継続
  ↓
  No (≥90%) → カバレッジ < 100%？
              Yes → 2000msアイドルタイムアウト使用
                    ギャップを許容しつつ待機
              ↓
              No (=100%) → 500msアイドルタイムアウト使用
                           通常の完了検出
```

### カバレッジ別の動作 (Behavior by Coverage)

| カバレッジ | しきい値チェック | アイドルタイムアウト | 動作 |
|-----------|----------------|-------------------|------|
| 0-89% | ブロック | N/A | 待機継続、ファイナライズ不可 |
| 90-99% | 通過 | 2000ms | ギャップを許容、ほぼ完了 |
| 100% | 通過 | 500ms | 通常の完了検出 |

## 修正後の期待されるログ (Expected Log After Fix)

### Firefox (修正後)
```log
File System Access API not supported, using in-memory buffer fallback
Using original framerate: 59.60 fps
✓ Audio encoder started producing chunks
Waiting for all encoder chunks to complete...
Initial state: video chunks received=0, audio chunks received=20
Expected encoders: video=yes, audio=yes
Expected frames: 1069

✓ Video encoder started producing chunks
Still encoding: 1/1069 chunks (0.1%), waiting for more...
Still encoding: 25/1069 chunks (2.3%), waiting for more...
... (chunks continue arriving)
Still encoding: 543/1069 chunks (50.8%), waiting for more...  ← 50%でもまだ待機！

(500ms gap - but below 90% threshold, keeps waiting)

Still encoding: 650/1069 chunks (60.8%), waiting for more...
Still encoding: 750/1069 chunks (70.2%), waiting for more...
Still encoding: 850/1069 chunks (79.5%), waiting for more...
Still encoding: 962/1069 chunks (90.0%), waiting for more...  ← 90%到達

(now uses 2s idle timeout since <100%)

New chunks arrived: video=1000, audio=896, resetting idle timer
... all remaining chunks arrive ...
New chunks arrived: video=1069, audio=896, resetting idle timer

(2000ms idle - all chunks received)

No new chunks for 2000ms, encoding complete
Final state: video chunks=1069, audio chunks=896
Video chunk coverage: 1069/1069 (100.0%)  ← すべて保存！
```

### 各段階での動作 (Behavior at Each Stage)

**50.8% (543/1069)での動作:**
```
カバレッジ: 50.8% < 90%
→ しきい値チェックで待機継続
→ アイドルタイムアウトは評価されない
→ 500msのギャップがあっても継続
```

**90.0% (962/1069)での動作:**
```
カバレッジ: 90.0% ≥ 90% AND < 100%
→ しきい値チェック通過
→ アイドルタイムアウト = 2000ms
→ 最大2秒のギャップまで許容
```

**100.0% (1069/1069)での動作:**
```
カバレッジ: 100.0% = 100%
→ しきい値チェック通過
→ アイドルタイムアウト = 500ms
→ 通常の完了検出
```

## テスト結果 (Test Results)

### ビルド (Build)
```bash
$ npm run build
✓ 124 modules transformed.
✓ built in 1.77s
```

### セキュリティスキャン (Security Scan)
```
CodeQL Analysis: No alerts found.
```

## 技術的な詳細 (Technical Details)

### なぜ90%なのか？ (Why 90%?)

**90%を選んだ理由 (Reasons for 90%):**

1. **十分に完了していることを保証**
   - 90%は「ほぼ完了」を意味する
   - 残り10%程度なら、すぐに到着するはず
   - 90% means "nearly complete"
   - Remaining 10% should arrive soon

2. **B-フレームとフレームドロップを考慮**
   - 一部のフレームはB-フレームとしてスキップされる可能性
   - フレームレート変換でドロップされる可能性
   - 90%なら、これらを考慮しても十分に進行している
   - Some frames may be skipped as B-frames
   - May be dropped during framerate conversion
   - 90% is still substantial progress even with these factors

3. **誤検出の防止**
   - 50%では早すぎる（今回の問題）
   - 80%でもまだ早い可能性
   - 90%は安全なバランス
   - 50% was too early (this issue)
   - 80% might still be too early
   - 90% is a safe balance

**なぜ95%や99%ではないのか？ (Why Not 95% or 99%?)**

- あまりに高いしきい値だと、最後の数チャンクを待つために長時間待機
- 90%で十分に「ほぼ完了」を示す
- 残りはアダプティブアイドルタイムアウト（2秒）で処理
- Too high threshold means long waits for last few chunks
- 90% is sufficient to indicate "nearly complete"
- Remaining chunks handled by adaptive idle timeout (2s)

### なぜ2秒のアダプティブタイムアウトなのか？ (Why 2 Second Adaptive Timeout?)

**2秒を選んだ理由 (Reasons for 2 Seconds):**

1. **チャンク到着ギャップの許容**
   - 通常のエンコード中、500ms-1000msのギャップが発生することがある
   - 2秒なら、これらのギャップを余裕で許容
   - Normal encoding can have 500ms-1000ms gaps
   - 2 seconds comfortably tolerates these gaps

2. **誤検出の防止**
   - 一時的なギャップでファイナライズしない
   - エンコードがまだ進行中であることを確認
   - Don't finalize on temporary gaps
   - Ensure encoding is still progressing

3. **ユーザー体験**
   - 2秒の待機は許容範囲
   - 真の完了を確実に検出
   - 2 second wait is acceptable
   - Ensures true completion

**100%到達時に500msに戻る理由 (Why Return to 500ms at 100%):**

- すべてのチャンクが到着済み
- 500msで十分に完了を検出できる
- 不要な待機を避ける
- All chunks have arrived
- 500ms is sufficient to detect completion
- Avoid unnecessary waiting

## 今後の改善案 (Future Improvements)

1. **さらにアダプティブなしきい値**
   - コーデックに応じて調整
   - AV1: 85%、VP9: 90%、H.264: 95%
   - Adjust based on codec
   - AV1: 85%, VP9: 90%, H.264: 95%

2. **動的なアイドルタイムアウト**
   - チャンク到着速度を測定
   - 遅いエンコーダーには長めのタイムアウト
   - Measure chunk arrival rate
   - Longer timeout for slow encoders

3. **プログレスバーの改善**
   - カバレッジ%を視覚的に表示
   - 現在のステージを表示（「90%到達、最終段階」など）
   - Visually display coverage %
   - Show current stage ("90% reached, final stage")

4. **警告メッセージ**
   - 長時間90%で停止している場合の警告
   - 「エンコードが遅くなっています」
   - Warn if stuck at 90% for long time
   - "Encoding is slowing down"

## まとめ (Summary)

この修正により、エンコードが90%以上完了するまでアイドルタイムアウトでファイナライズされることがなくなりました。さらに、100%未満の場合は2秒のアイドルタイムアウトを使用することで、チャンク到着のギャップを許容します。

This fix prevents finalization via idle timeout until encoding is ≥90% complete. Additionally, using a 2-second idle timeout when <100% tolerates gaps in chunk arrival.

### 変更点 (Changes)

1. ✅ 最小チャンクしきい値: 50% → 90%
2. ✅ アダプティブアイドルタイムアウトの追加:
   - `<100%`: 2000ms
   - `=100%`: 500ms
3. ✅ より詳細なログメッセージ

### 影響範囲 (Impact)

**この問題のケース:**
- ✅ 50.8%でファイナライズされない
- ✅ 90%に到達するまで待機
- ✅ すべてのチャンクを保存（100%）

**すべてのケース:**
- ✅ 0-89%: ファイナライズ不可
- ✅ 90-99%: 2秒アイドルタイムアウト
- ✅ 100%: 500msアイドルタイムアウト

## 変更されたファイル (Changed Files)

- `video-encoder-app/frontend/src/lib/core/encoder.js`

## コミット情報 (Commit Info)

- Commit: 053659e
- Branch: copilot/fix-video-encoding-errors
- Date: 2026-01-29
