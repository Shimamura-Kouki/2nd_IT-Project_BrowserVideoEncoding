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
      codec: 'avc1.42e01e', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30, audio_bitrate: 128_000
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

  onMount(() => {
    presets = loadPresets();
  });
</script>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: system-ui, sans-serif;
    background: #f5f5f5;
    padding: 20px;
  }

  .container {
    max-width: 960px;
    margin: 0 auto;
    background: white;
    padding: 24px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  h1 {
    margin-bottom: 24px;
    color: #333;
  }

  .dropzone {
    border: 2px dashed #888;
    padding: 40px;
    text-align: center;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;
    margin-bottom: 24px;
  }

  .dropzone:hover {
    border-color: #2979ff;
    background: #f0f7ff;
  }

  .dropzone input {
    display: none;
  }

  .dropzone p {
    color: #666;
    margin-top: 8px;
  }

  .panel {
    margin-bottom: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid #eee;
  }

  .panel:last-child {
    border-bottom: none;
  }

  .row {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .row label {
    font-weight: 500;
    color: #333;
    min-width: 100px;
  }

  .row input,
  .row select {
    flex: 1;
    min-width: 200px;
    padding: 8px 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
  }

  .row input:focus,
  .row select:focus {
    outline: none;
    border-color: #2979ff;
    box-shadow: 0 0 0 3px rgba(41, 121, 255, 0.1);
  }

  .progress {
    height: 8px;
    background: #eee;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .progress > div {
    height: 100%;
    background: #2979ff;
    width: 0%;
    transition: width 0.2s;
  }

  button {
    padding: 10px 16px;
    background: #2979ff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: background 0.3s;
    width: 100%;
  }

  button:hover {
    background: #1e5db8;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #ccc;
  }

  p {
    color: #666;
    font-size: 14px;
  }
</style>

<div class="container">
  <h1>ブラウザ動画エンコーダ</h1>

  <div class="dropzone" on:click={() => document.getElementById('fileInput')?.click()}>
    <input type="file" id="fileInput" accept="video/mp4" on:change={pickFile} />
    <p>MP4ファイルをドラッグ&ドロップ または クリックして選択</p>
  </div>

  {#if file}
    <div class="panel">
      <p>選択: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>
    </div>
  {/if}

  {#if presets.length > 0}
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

    {#if encoding}
      <div class="panel">
        <div class="progress"><div style="width:{progressPct}%"></div></div>
        <p>進捗: {Math.round(progressPct)}%</p>
        <p>FPS: {fps > 0 ? fps.toFixed(1) : '-'} | 経過: {(elapsedMs/1000).toFixed(1)}s</p>
      </div>
    {/if}

    {#if message}
      <div class="panel">
        <p style="color: #2e7d32; background: #e8f5e9; padding: 12px; border-radius: 4px;">{message}</p>
      </div>
    {/if}
  {:else}
    <div class="panel">
      <p style="color: #999;">プリセットを読み込み中...</p>
    </div>
  {/if}
</div>
