<script lang="ts">
  import { onMount } from 'svelte';
  import { getPresets, postStore } from './lib/api/client.js';
  import { encodeToFile } from './lib/core/encoder.js';

  let file: File | null = null;
  let presets: any[] = [];
  let selectedPresetIndex = 0;
  let progressPct = 0;
  let fps = 0;
  let elapsedMs = 0;
  let userName = '';
  let comment = '';
  let encoding = false;

  const pickFile = (e: Event) => {
    const input = e.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
  };

  async function startEncoding() {
    if (!file) return;
    encoding = true;

    const preset = presets[selectedPresetIndex]?.config_json ?? {
      codec: 'avc1.42001f', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30, audio_bitrate: 128_000
    };

    const config = {
      video: { codec: preset.codec, width: preset.width, height: preset.height, bitrate: preset.bitrate, framerate: preset.framerate },
      audio: { codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: preset.audio_bitrate ?? 128000 }
    };

    const start = performance.now();
    await encodeToFile(file, config, (pct?: number, stats?: { fps: number, elapsedMs: number }) => {
      if (pct !== undefined) progressPct = pct;
      if (stats) { fps = stats.fps; elapsedMs = stats.elapsedMs; }
    });

    const end = performance.now();
    const result = {
      process_time_ms: Math.round(end - start),
      source_size_byte: file.size,
      output_size_byte: 0,
      avg_fps: fps
    };

    alert('エンコードが完了しました。共有用データを送信できます。');

    const payload = {
      user_name: userName || 'Anonymous',
      comment,
      config_json: preset,
      benchmark_result: result,
      user_agent: navigator.userAgent
    };

    try {
      const r = await postStore(payload);
      console.log('POST /api post_store:', r);
    } catch (e) {
      console.error(e);
      alert('共有APIへの送信に失敗しました。');
    }

    encoding = false;
  }

  onMount(async () => {
    try {
      presets = await getPresets();
    } catch (e) {
      console.warn('プリセット取得に失敗。バックエンド未起動かも', e);
    }
  });
</script>

<div class="container">
  <h1>ブラウザ動画エンコーダ</h1>

  <div class="dropzone">
    <input type="file" accept="video/mp4" on:change={pickFile} />
    <p>MP4ファイルを選択してください</p>
  </div>

  <div class="panel">
    <div class="row">
      <label>プリセット:</label>
      <select bind:value={selectedPresetIndex}>
        {#each presets as p, i}
          <option value={i}>{p.name}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="panel">
    <div class="row">
      <label>ユーザー名:</label>
      <input bind:value={userName} placeholder="Your name" />
    </div>
    <div class="row">
      <label>コメント:</label>
      <input bind:value={comment} placeholder="コメント" />
    </div>
  </div>

  <div class="panel">
    <button on:click={startEncoding} disabled={!file || encoding}>エンコード開始</button>
  </div>

  <div class="panel">
    <div class="progress"><div style={`width:${progressPct}%`}></div></div>
    <p>進捗: {Math.round(progressPct)}% | FPS: {fps.toFixed(1)} | 経過: {(elapsedMs/1000).toFixed(1)}s</p>
  </div>
</div>
