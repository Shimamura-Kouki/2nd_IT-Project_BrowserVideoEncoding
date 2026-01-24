<script lang="ts">
  import { onMount } from 'svelte';
  import { encodeToFile } from './lib/core/encoder.js';
  import { loadPresets } from './lib/presets.js';

  let file: File | null = null;
  let presets: any[] = [];
  let selectedPresetIndex = 0;
  let usePreset = true;
  let showDetailedSettings = false; // NEW: Track if detailed settings are visible
  let progressPct = 0;
  let fps = 0;
  let elapsedMs = 0;
  let etaMs = 0;
  let encoding = false;
  let message = '';

  // Required settings
  let containerFormat = 'mp4';
  let videoCodec = 'avc1.640028';
  let audioCodec = 'mp4a.40.2';
  
  // Resolution settings
  let resolutionMode = 'preset'; // 'preset', 'manual', 'width-only', 'height-only', 'original'
  let resolutionPreset = '1080p';
  let manualWidth = 1920;
  let manualHeight = 1080;
  let widthOnly = 1920;
  let heightOnly = 1080;
  
  // Frame rate settings
  let framerateMode = 'manual'; // 'original', 'manual'
  let framerate = 30;
  let videoBitrate = 5000; // in Kbps
  let audioBitrate = 128; // in Kbps

  // Optional settings
  let rotation = 0;
  let flipHorizontal = false;
  let flipVertical = false;

  const resolutionPresets = {
    '2160p': { width: 3840, height: 2160 },
    '1440p': { width: 2560, height: 1440 },
    '1080p': { width: 1920, height: 1080 },
    '720p': { width: 1280, height: 720 },
    '480p': { width: 854, height: 480 },
    '360p': { width: 640, height: 360 }
  };

  const pickFile = (e: Event) => {
    const input = e.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
  };

  function applyPreset() {
    const preset = presets[selectedPresetIndex]?.config_json ?? presets[selectedPresetIndex];
    if (preset) {
      // Apply all preset settings to detailed mode
      containerFormat = preset.container ?? 'mp4';
      videoCodec = preset.codec ?? 'avc1.640028';
      audioCodec = preset.audioCodec ?? 'mp4a.40.2';
      videoBitrate = (preset.bitrate ?? 5_000_000) / 1000;
      audioBitrate = (preset.audio_bitrate ?? 128_000) / 1000;
      framerate = preset.framerate ?? 30;
      
      // Handle "元ファイルを維持" presets
      if (preset.preserveOriginal) {
        resolutionMode = 'original';
        framerateMode = 'original';
      } else if (preset.width && preset.height) {
        resolutionMode = 'preset';
        manualWidth = preset.width;
        manualHeight = preset.height;
        framerateMode = 'manual';
        
        // Find matching preset resolution
        const matchingPreset = Object.entries(resolutionPresets).find(
          ([_, res]) => res.width === preset.width && res.height === preset.height
        );
        if (matchingPreset) {
          resolutionPreset = matchingPreset[0];
        }
      }
    }
  }
  
  function toggleDetailedSettings() {
    showDetailedSettings = !showDetailedSettings;
    if (!showDetailedSettings) {
      // Reset to preset values when closing
      applyPreset();
    }
  }

  async function startEncoding() {
    if (!file) return;
    message = '';
    encoding = true;

    let width: number | undefined;
    let height: number | undefined;

    if (resolutionMode === 'original') {
      // Keep original resolution - don't specify width/height
      width = undefined;
      height = undefined;
    } else if (resolutionMode === 'preset') {
      const res = resolutionPresets[resolutionPreset];
      width = res.width;
      height = res.height;
    } else if (resolutionMode === 'manual') {
      width = manualWidth;
      height = manualHeight;
    } else if (resolutionMode === 'width-only') {
      width = widthOnly;
      height = undefined;
    } else if (resolutionMode === 'height-only') {
      width = undefined;
      height = heightOnly;
    }

    const config = {
      video: { 
        codec: videoCodec, 
        container: containerFormat,
        width: width, 
        height: height, 
        bitrate: videoBitrate * 1000, 
        framerate: framerate,
        framerateMode: framerateMode,
        rotation: rotation,
        flipHorizontal: flipHorizontal,
        flipVertical: flipVertical
      },
      audio: { 
        codec: audioCodec, 
        sampleRate: 44100, 
        numberOfChannels: 2, 
        bitrate: audioBitrate * 1000 
      }
    };

    const start = performance.now();
    await encodeToFile(file, config, (pct?: number, stats?: { fps: number, elapsedMs: number, etaMs?: number }) => {
      if (pct !== undefined) progressPct = pct;
      if (stats) { 
        fps = stats.fps; 
        elapsedMs = stats.elapsedMs;
        etaMs = stats.etaMs ?? 0;
      }
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

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: #333;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid #2979ff;
  }

  .checkbox-group {
    display: flex;
    gap: 24px;
    align-items: center;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    min-width: auto;
  }

  .row input[type="number"] {
    flex: 0 1 150px;
  }

  .preset-toggle {
    margin-bottom: 16px;
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
    <div class="panel preset-toggle">
      <div class="row">
        <label>プリセット:</label>
        <select bind:value={selectedPresetIndex} on:change={applyPreset}>
          {#each presets as p, i}
            <option value={i}>{p.name}</option>
          {/each}
        </select>
      </div>
      
      <div class="row">
        <label>コーデック:</label>
        <div style="display: flex; gap: 8px; flex: 1;">
          <select bind:value={videoCodec} style="flex: 1;">
            <optgroup label="H.264 (AVC)">
              <option value="avc1.640028">H.264 High</option>
              <option value="avc1.4d001f">H.264 Main</option>
              <option value="avc1.42001f">H.264 Baseline</option>
            </optgroup>
            <optgroup label="H.265 (HEVC)">
              <option value="hev1.1.6.L93.B0">H.265 Main</option>
              <option value="hvc1.1.6.L93.B0">H.265 Main (hvc1)</option>
            </optgroup>
            <optgroup label="VP9">
              <option value="vp09.00.31.08">VP9 Profile 0</option>
              <option value="vp09.00.41.08">VP9 Profile 0 L4.1</option>
            </optgroup>
            <optgroup label="AV1">
              <option value="av01.0.05M.08">AV1 Main L3.1</option>
              <option value="av01.0.04M.08">AV1 Main L3.0</option>
            </optgroup>
          </select>
          <select bind:value={audioCodec} style="flex: 1;">
            <option value="mp4a.40.2">AAC-LC</option>
            <option value="mp4a.40.5">AAC-HE</option>
            <option value="opus">Opus</option>
          </select>
        </div>
      </div>
      
      <div class="row">
        <button 
          type="button" 
          on:click={toggleDetailedSettings} 
          style="width: 100%; padding: 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          {showDetailedSettings ? '詳細設定を閉じる（設定をリセット）' : '詳細設定を開く'}
        </button>
      </div>
    </div>

    {#if showDetailedSettings}
      <!-- Required Settings -->
      <div class="panel">
        <h3 class="section-title">詳細設定</h3>
        
        <div class="row">
          <label>コンテナ形式:</label>
          <select bind:value={containerFormat}>
            <option value="mp4">MP4</option>
            <option value="mov">MOV</option>
            <option value="webm">WebM</option>
          </select>
        </div>

        <div class="row">
          <label>解像度モード:</label>
          <select bind:value={resolutionMode}>
            <option value="original">元の解像度を保持</option>
            <option value="preset">プリセット</option>
            <option value="manual">手動指定(幅×高さ)</option>
            <option value="width-only">幅のみ指定</option>
            <option value="height-only">高さのみ指定</option>
          </select>
        </div>

        {#if resolutionMode === 'preset'}
          <div class="row">
            <label>解像度プリセット:</label>
            <select bind:value={resolutionPreset}>
              <option value="2160p">4K (3840×2160)</option>
              <option value="1440p">1440p (2560×1440)</option>
              <option value="1080p">1080p (1920×1080)</option>
              <option value="720p">720p (1280×720)</option>
              <option value="480p">480p (854×480)</option>
              <option value="360p">360p (640×360)</option>
            </select>
          </div>
        {:else if resolutionMode === 'manual'}
          <div class="row">
            <label>幅 (px):</label>
            <input type="number" bind:value={manualWidth} min="64" max="7680" step="2" />
          </div>
          <div class="row">
            <label>高さ (px):</label>
            <input type="number" bind:value={manualHeight} min="64" max="4320" step="2" />
          </div>
        {:else if resolutionMode === 'width-only'}
          <div class="row">
            <label>幅 (px):</label>
            <input type="number" bind:value={widthOnly} min="64" max="7680" step="2" />
            <p style="color: #999; font-size: 12px;">高さは元の比率から自動計算されます</p>
          </div>
        {:else if resolutionMode === 'height-only'}
          <div class="row">
            <label>高さ (px):</label>
            <input type="number" bind:value={heightOnly} min="64" max="4320" step="2" />
            <p style="color: #999; font-size: 12px;">幅は元の比率から自動計算されます</p>
          </div>
        {/if}

        <div class="row">
          <label>フレームレートモード:</label>
          <select bind:value={framerateMode}>
            <option value="original">元のフレームレートを保持</option>
            <option value="manual">手動指定</option>
          </select>
        </div>

        {#if framerateMode === 'manual'}
          <div class="row">
            <label>フレームレート (fps):</label>
            <input type="number" bind:value={framerate} min="1" max="120" step="1" />
          </div>
        {/if}

        <div class="row">
          <label>映像ビットレート (Kbps):</label>
          <input type="number" bind:value={videoBitrate} min="100" max="50000" step="100" />
        </div>

        <div class="row">
          <label>音声ビットレート (Kbps):</label>
          <input type="number" bind:value={audioBitrate} min="32" max="320" step="8" />
        </div>
      </div>

      <!-- Optional Settings -->
      <div class="panel">
        <h3 class="section-title">任意設定</h3>
        <p style="color: #ff9800; background: #fff3e0; padding: 8px; border-radius: 4px; font-size: 12px; margin-bottom: 16px;">
          ⚠️ 回転と反転機能は現在開発中のため、設定しても適用されません
        </p>
        
        <div class="row">
          <label>映像の回転:</label>
          <select bind:value={rotation}>
            <option value={0}>0度</option>
            <option value={90}>90度</option>
            <option value={180}>180度</option>
            <option value={270}>270度</option>
          </select>
        </div>

        <div class="row">
          <label>映像の反転:</label>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={flipHorizontal} />
              <span>左右反転</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={flipVertical} />
              <span>上下反転</span>
            </label>
          </div>
        </div>
      </div>
    {/if}

    <div class="panel">
      <button on:click={startEncoding} disabled={!file || encoding}>エンコード開始</button>
    </div>

    {#if encoding}
      <div class="panel">
        <div class="progress"><div style="width:{progressPct}%"></div></div>
        <p>進捗: {Math.round(progressPct)}%</p>
        <p>FPS: {fps > 0 ? fps.toFixed(1) : '-'} | 経過: {(elapsedMs/1000).toFixed(1)}s</p>
        {#if etaMs > 0 && progressPct < 100}
          <p>推定残り時間: {(etaMs/1000).toFixed(1)}s</p>
        {/if}
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

