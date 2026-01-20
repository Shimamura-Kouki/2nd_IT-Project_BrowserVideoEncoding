<script lang="ts">
  import { onMount } from 'svelte';
  import { encodeToFile } from './lib/core/encoder.js';
  import { loadPresets } from './lib/presets.js';

  let file: File | null = null;
  let presets: any[] = [];
  let selectedPresetIndex = 0;
  let progressPct = 0;
  let fps = 0;
  let elapsedMs = 0;
  let encoding = false;
  let message = '';

  const pickFile = (e: Event) => {
    const input = e.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
  };

  async function startEncoding() {
    if (!file) return;
    message = '';
    encoding = true;

    const preset = presets[selectedPresetIndex]?.config_json ?? presets[selectedPresetIndex] ?? {
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

    message = `エンコードが完了しました (処理時間: ${result.process_time_ms}ms, 平均FPS: ${result.avg_fps.toFixed(1)})`;
    encoding = false;
  }

  onMount(async () => {
    presets = loadPresets();
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
    <button on:click={startEncoding} disabled={!file || encoding}>エンコード開始</button>
  </div>

  <div class="panel">
    <div class="progress"><div style={`width:${progressPct}%`}></div></div>
    <p>進捗: {Math.round(progressPct)}% | FPS: {fps.toFixed(1)} | 経過: {(elapsedMs/1000).toFixed(1)}s</p>
    {#if message}
      <p>{message}</p>
    {/if}
  </div>
</div>
