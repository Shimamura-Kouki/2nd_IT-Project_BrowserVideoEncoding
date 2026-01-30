<script lang="ts">
  import { onMount } from 'svelte';
  import { encodeToFile } from './lib/core/encoder.js';
  import { loadPresets } from './lib/presets.js';
  import { roundToValidAACBitrate } from './lib/utils/audioUtils.js';
  import { CONTAINER_OVERHEAD_PERCENTAGE, MINIMUM_VIDEO_BITRATE, MAX_MP4BOX_PARSING_ERRORS } from './lib/constants.js';
  import MP4Box from 'mp4box';
  import ThemeSwitcher from './ThemeSwitcher.svelte';

  let file: File | null = null;
  let presets: any[] = [];
  let selectedPresetIndex = 0;
  let usePreset = true;
  let showDetailedSettings = false; // NEW: Track if detailed settings are visible
  let progressPct = 0;
  let loadingProgressPct = 0; // Separate progress for file loading/demuxing
  let encodingProgressPct = 0; // Separate progress for encoding
  let fps = 0;
  let elapsedMs = 0;
  let etaMs = 0;
  let encoding = false;
  let paused = false;
  let abortController: AbortController | null = null;
  let message = '';
  let errorLogs: string[] = [];
  let showErrorLogs = false;
  let showSeekWarning = false; // Warning for video seeking limitation

  // Browser compatibility detection
  let isFirefox = false;
  let showBrowserWarning = true;

  // Source file metadata (extracted from demuxer)
  let originalWidth = 0;
  let originalHeight = 0;
  let originalFramerate = 0;
  let originalVideoBitrate = 0;
  let originalAudioBitrate = 0;
  let sourceFileAnalyzed = false;

  // Required settings
  let containerFormat = 'mp4';
  let videoCodec = 'avc1.640028';
  let audioCodec = 'mp4a.40.2';
  
  // Resolution settings
  let resolutionMode = 'preset'; // 'preset', 'manual', 'width-only', 'height-only', 'original'
  let resolutionPreset = '1920';
  let manualWidth = 1920;
  let manualHeight = 1080;
  let widthOnly = 1920;
  let heightOnly = 1080;
  
  // Computed output resolution
  let outputWidth = 0;
  let outputHeight = 0;
  
  // Frame rate settings
  let framerateMode = 'manual'; // 'original', 'manual'
  let framerate = 30;
  
  // Bitrate settings - quality-based
  let qualityLevel = '中'; // 最高, 高, 中, 低, 最低, カスタム
  let audioQualityLevel = '中'; // 最高, 高, 中, 低, 最低
  let customVideoBitrate = 5000; // in Kbps, used when qualityLevel is 'カスタム'
  let customAudioBitrate = 128; // in Kbps, used when qualityLevel is 'カスタム'

  // Auto-change container based on video codec selection only (to avoid cycles)
  $: {
    if (videoCodec.startsWith('vp09') || videoCodec.startsWith('vp08') || videoCodec.startsWith('av01')) {
      containerFormat = 'webm';
    } else if (videoCodec.startsWith('avc1') || videoCodec.startsWith('hev1') || videoCodec.startsWith('hvc1')) {
      containerFormat = 'mp4';
    }
  }

  // Auto-switch audio codec based on container format
  $: {
    // Only auto-switch for MP4 containers to avoid opus conflicts
    if (containerFormat === 'mp4' && !audioCodec.startsWith('mp4a')) {
      // If somehow we have opus in MP4, switch to AAC-LC
      audioCodec = 'mp4a.40.2';
    }
    
    // Always use AAC-LC for MP4 containers
    if (containerFormat === 'mp4') {
      if (audioCodec.startsWith('mp4a.40.5')) {
        audioCodec = 'mp4a.40.2';
      }
    } else if (containerFormat === 'webm' && audioCodec.startsWith('mp4a')) {
      // If we switched to WebM but still have AAC, switch to Opus
      audioCodec = 'opus';
    }
  }

  // Auto-expand error log when errors occur during encoding
  $: if (errorLogs.length > 0 && encoding) {
    showErrorLogs = true;
  }

  // Reactive computed bitrates for display
  let estimatedVideoBitrate = 0;
  let estimatedAudioBitrate = 0;

  // Recalculate bitrates when relevant settings change
  $: {
    // Trigger recalculation when any of these change
    const deps = [
      qualityLevel, audioQualityLevel, customVideoBitrate, customAudioBitrate,
      videoCodec, audioCodec, containerFormat,
      resolutionMode, resolutionPreset, manualWidth, manualHeight, widthOnly, heightOnly,
      originalVideoBitrate, originalAudioBitrate, originalWidth, originalHeight,
      sourceFileAnalyzed
    ];
    estimatedVideoBitrate = calculateBitrate(true);
    estimatedAudioBitrate = calculateBitrate(false);
  }
  
  // Calculate output resolution
  $: {
    if (!sourceFileAnalyzed || originalWidth === 0 || originalHeight === 0) {
      outputWidth = 0;
      outputHeight = 0;
    } else if (resolutionMode === 'original') {
      outputWidth = originalWidth;
      outputHeight = originalHeight;
    } else if (resolutionMode === 'preset') {
      const preset = resolutionPresets[resolutionPreset];
      if (preset) {
        const dims = calculateDimensionsFromLongestEdge(preset.longestEdge, originalWidth, originalHeight);
        outputWidth = dims.width;
        outputHeight = dims.height;
      }
    } else if (resolutionMode === 'manual') {
      outputWidth = manualWidth;
      outputHeight = manualHeight;
    } else if (resolutionMode === 'width-only') {
      outputWidth = widthOnly;
      outputHeight = Math.round((widthOnly / originalWidth) * originalHeight);
      // Ensure even number
      if (outputHeight % 2 !== 0) outputHeight = outputHeight - 1;
    } else if (resolutionMode === 'height-only') {
      outputWidth = Math.round((heightOnly / originalHeight) * originalWidth);
      outputHeight = heightOnly;
      // Ensure even number
      if (outputWidth % 2 !== 0) outputWidth = outputWidth - 1;
    }
  }

  // Resolution presets based on longest edge
  const resolutionPresets = {
    '3840': { longestEdge: 3840, label: '3840 (4K)' },
    '2560': { longestEdge: 2560, label: '2560 (1440p)' },
    '1920': { longestEdge: 1920, label: '1920 (1080p)' },
    '1280': { longestEdge: 1280, label: '1280 (720p)' },
    '854': { longestEdge: 854, label: '854 (480p)' },
    '640': { longestEdge: 640, label: '640 (360p)' }
  };
  
  // Helper function to calculate dimensions from longest edge
  function calculateDimensionsFromLongestEdge(longestEdge: number, sourceWidth: number, sourceHeight: number): { width: number, height: number } {
    const isLandscape = sourceWidth >= sourceHeight;
    const aspectRatio = sourceWidth / sourceHeight;
    
    if (isLandscape) {
      const width = longestEdge;
      const height = Math.round(longestEdge / aspectRatio);
      return { width, height: height % 2 === 0 ? height : height - 1 }; // Ensure even number
    } else {
      const height = longestEdge;
      const width = Math.round(longestEdge * aspectRatio);
      return { width: width % 2 === 0 ? width : width - 1, height }; // Ensure even number
    }
  }

  const pickFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
    sourceFileAnalyzed = false; // Reset analysis state when new file is picked
    showSeekWarning = false; // Reset seek warning when new file is picked
    originalWidth = 0;
    originalHeight = 0;
    originalFramerate = 0;
    originalVideoBitrate = 0;
    originalAudioBitrate = 0;
    
    // Analyze file immediately when selected
    if (file) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const mp4boxfile = MP4Box.createFile();
        let analysisErrorCount = 0;
        
        mp4boxfile.onReady = (info: any) => {
          const videoTrack = info.videoTracks?.[0];
          const audioTrack = info.audioTracks?.[0];
          
          // First, determine audio bitrate
          if (audioTrack) {
            // Calculate audio bitrate
            if (audioTrack.bitrate) {
              originalAudioBitrate = audioTrack.bitrate;
            } else {
              originalAudioBitrate = 128000; // default estimate
            }
          }
          
          if (videoTrack) {
            originalWidth = videoTrack.video.width;
            originalHeight = videoTrack.video.height;
            originalFramerate = videoTrack.movie_duration && videoTrack.nb_samples 
              ? (videoTrack.nb_samples * videoTrack.movie_timescale / videoTrack.movie_duration)
              : 30;
            
            // Calculate video bitrate
            if (videoTrack.bitrate) {
              originalVideoBitrate = videoTrack.bitrate;
            } else if (videoTrack.movie_duration && info.size) {
              const durationSec = videoTrack.movie_duration / videoTrack.movie_timescale;
              // Calculate total bitrate from file size
              const totalBitrate = Math.round((info.size * 8) / durationSec);
              // Subtract audio bitrate and estimated container overhead
              const containerOverhead = totalBitrate * CONTAINER_OVERHEAD_PERCENTAGE;
              originalVideoBitrate = Math.round(totalBitrate - originalAudioBitrate - containerOverhead);
              // Ensure video bitrate is at least positive
              if (originalVideoBitrate < MINIMUM_VIDEO_BITRATE) {
                originalVideoBitrate = MINIMUM_VIDEO_BITRATE;
              }
            }
          }
          
          sourceFileAnalyzed = true;
        };
        
        mp4boxfile.onError = (e: any) => {
          analysisErrorCount++;
          // Use console.warn for recoverable errors during analysis
          console.warn(`MP4Box analysis warning (${analysisErrorCount}/${MAX_MP4BOX_PARSING_ERRORS}):`, e);
          
          // If too many errors occur during analysis, mark analysis as failed
          // but still allow the file to be selected (demuxer will try again)
          if (analysisErrorCount >= MAX_MP4BOX_PARSING_ERRORS) {
            console.warn('File analysis failed due to too many errors. Video metadata may be incomplete.');
            // Mark as analyzed anyway to avoid blocking user
            sourceFileAnalyzed = true;
          }
        };
        
        arrayBuffer.fileStart = 0;
        try {
          mp4boxfile.appendBuffer(arrayBuffer);
          mp4boxfile.flush();
        } catch (error) {
          console.error('Failed to parse MP4 file during analysis:', error);
          // Mark as analyzed to allow user to proceed
          sourceFileAnalyzed = true;
        }
      } catch (error) {
        console.error('Failed to analyze file:', error);
        // Mark as analyzed to allow user to proceed even if initial setup fails
        sourceFileAnalyzed = true;
      }
    }
  };

  // Calculate bitrate based on quality level and codec
  function calculateBitrate(isVideo: boolean): number {
    const baseRate = isVideo ? originalVideoBitrate : originalAudioBitrate;
    if (!baseRate || baseRate === 0) {
      // Fallback if no original bitrate detected
      return isVideo ? 5_000_000 : 128_000;
    }

    let result: number;
    
    // Determine base bitrate based on quality level
    if (qualityLevel === 'カスタム' && isVideo) {
      // Use custom video bitrate directly - user has explicitly set the value
      result = customVideoBitrate * 1000;
      
      // Apply maximum video bitrate cap: 50 Mbps
      const VIDEO_MAX_BITRATE = 50_000_000;
      if (result > VIDEO_MAX_BITRATE) {
        result = VIDEO_MAX_BITRATE;
      }
      
      // Skip codec efficiency and resolution adjustments for custom bitrate
    } else if (!isVideo) {
      // Audio bitrate calculation based on audioQualityLevel
      // Use fixed bitrates centered around 128Kbps with 5 levels
      // For AAC: only 4 valid values [96, 128, 160, 192] Kbps
      // For Opus: can use 5 levels [64, 96, 128, 160, 192] Kbps
      
      let targetBitrate: number;
      
      // Determine which codec will be used
      let effectiveAudioCodec = audioCodec;
      if (containerFormat === 'mp4') {
        effectiveAudioCodec = 'mp4a.40.2'; // Always AAC-LC for MP4
      }
      
      if (effectiveAudioCodec === 'opus') {
        // Opus supports 5 levels
        switch (audioQualityLevel) {
          case '最高': targetBitrate = 192_000; break;
          case '高': targetBitrate = 160_000; break;
          case '中': targetBitrate = 128_000; break;
          case '低': targetBitrate = 96_000; break;
          case '最低': targetBitrate = 64_000; break;
          default: targetBitrate = 128_000;
        }
      } else if (effectiveAudioCodec.startsWith('mp4a')) {
        // AAC supports only 4 levels: [96, 128, 160, 192] Kbps
        // Map 5 quality levels to 4 bitrate values
        switch (audioQualityLevel) {
          case '最高': targetBitrate = 192_000; break;
          case '高': targetBitrate = 160_000; break;
          case '中': targetBitrate = 128_000; break;
          case '低': targetBitrate = 96_000; break;
          case '最低': targetBitrate = 96_000; break; // AAC minimum is 96
          default: targetBitrate = 128_000;
        }
      } else {
        // Fallback to 128 Kbps
        targetBitrate = 128_000;
      }
      
      result = targetBitrate;
    } else {
      // Video bitrate: Calculate from base rate with quality multiplier
      let multiplier = 1.0;
      switch (qualityLevel) {
        case '最高': multiplier = 1.0; break;
        case '高': multiplier = 0.8; break;
        case '中': multiplier = 0.6; break;
        case '低': multiplier = 0.4; break;
        case '最低': multiplier = 0.25; break;
      }
      result = baseRate * multiplier;
      
      // Adjust for codec efficiency (video only)
      if (videoCodec.startsWith('vp09')) {
        result *= 0.7; // VP9 is ~30% more efficient
      } else if (videoCodec.startsWith('av01')) {
        result *= 0.6; // AV1 is ~40% more efficient
      }

      // Adjust for resolution if different from original
      if (resolutionMode !== 'original') {
        let targetWidth = originalWidth;
        let targetHeight = originalHeight;
        
        if (resolutionMode === 'preset') {
          const preset = resolutionPresets[resolutionPreset];
          if (preset) {
            const dims = calculateDimensionsFromLongestEdge(preset.longestEdge, originalWidth, originalHeight);
            targetWidth = dims.width;
            targetHeight = dims.height;
          }
        } else if (resolutionMode === 'manual') {
          targetWidth = manualWidth;
          targetHeight = manualHeight;
        } else if (resolutionMode === 'width-only') {
          targetWidth = widthOnly;
          targetHeight = Math.round((widthOnly / originalWidth) * originalHeight);
        } else if (resolutionMode === 'height-only') {
          targetWidth = Math.round((heightOnly / originalHeight) * originalWidth);
          targetHeight = heightOnly;
        }
        
        const originalPixels = originalWidth * originalHeight;
        const targetPixels = targetWidth * targetHeight;
        const pixelRatio = targetPixels / originalPixels;
        
        // Don't increase bitrate when upscaling (pixel ratio > 1)
        // Upscaling doesn't improve quality, so cap at original bitrate
        if (pixelRatio <= 1.0) {
          result *= pixelRatio;
        }
        // If upscaling (pixelRatio > 1), keep result as-is (don't scale up)
      }
      
      // Apply maximum video bitrate cap: 50 Mbps
      const VIDEO_MAX_BITRATE = 50_000_000;
      if (result > VIDEO_MAX_BITRATE) {
        result = VIDEO_MAX_BITRATE;
      }
    }
    
    // Audio bitrate codec-specific constraints (applied for both custom and calculated)
    if (!isVideo) {
      
      // Apply audio codec multipliers if needed
      // (none currently, but this is where they would go)
      
      // Determine which codec SHOULD be used based on container format
      // For MP4 containers, always use AAC-LC
      let effectiveAudioCodec = audioCodec;
      if (containerFormat === 'mp4') {
        if (audioCodec.startsWith('mp4a.40.2') || audioCodec.startsWith('mp4a.40.5')) {
          effectiveAudioCodec = 'mp4a.40.2'; // Always use AAC-LC for MP4
        }
      }
      
      // Enforce codec-specific bitrate constraints and caps
      if (effectiveAudioCodec === 'opus') {
        // Opus: minimum 32 Kbps, maximum 256 Kbps
        const OPUS_MIN = 32_000;
        const OPUS_MAX = 256_000;
        if (result < OPUS_MIN) result = OPUS_MIN;
        if (result > OPUS_MAX) result = OPUS_MAX;
      } else if (effectiveAudioCodec.startsWith('mp4a.40.2')) {
        // AAC-LC: Must be one of [96, 128, 160, 192] Kbps
        const AAC_LC_MIN = 96_000;
        const AAC_LC_MAX = 192_000;
        
        if (result < AAC_LC_MIN) result = AAC_LC_MIN;
        if (result > AAC_LC_MAX) result = AAC_LC_MAX;
        
        // Round to nearest valid value using shared utility
        result = roundToValidAACBitrate(result);
      } else if (effectiveAudioCodec.startsWith('mp4a.40.5')) {
        // AAC-HE: Must be one of [96, 128, 160, 192] Kbps (same as AAC-LC)
        const AAC_HE_MIN = 96_000;
        const AAC_HE_MAX = 192_000;
        if (result < AAC_HE_MIN) result = AAC_HE_MIN;
        if (result > AAC_HE_MAX) result = AAC_HE_MAX;
        
        // Round to nearest valid value using shared utility
        result = roundToValidAACBitrate(result);
      }
    }

    return Math.round(result);
  }

  function applyPreset() {
    const preset = presets[selectedPresetIndex]?.config_json ?? presets[selectedPresetIndex];
    if (preset) {
      // Apply all preset settings to detailed mode
      containerFormat = preset.container ?? 'mp4';
      videoCodec = preset.codec ?? 'avc1.640028';
      audioCodec = preset.audioCodec ?? 'mp4a.40.2';
      
      // Set quality level based on preset bitrate
      if (preset.preserveOriginal) {
        qualityLevel = '高'; // Default quality for preserve presets
      } else {
        qualityLevel = '中'; // Default quality for standard presets
      }
      customVideoBitrate = (preset.bitrate ?? 5_000_000) / 1000;
      customAudioBitrate = (preset.audio_bitrate ?? 128_000) / 1000;
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

  function resetSettings() {
    // Reset to default values
    selectedPresetIndex = 0;
    containerFormat = 'mp4';
    videoCodec = 'avc1.640028';
    audioCodec = 'mp4a.40.2';
    resolutionMode = 'preset';
    resolutionPreset = '1920';
    manualWidth = 1920;
    manualHeight = 1080;
    widthOnly = 1920;
    heightOnly = 1080;
    framerateMode = 'manual';
    framerate = 30;
    qualityLevel = '中';
    audioQualityLevel = '中';
    customVideoBitrate = 5000;
    customAudioBitrate = 128;
    showDetailedSettings = false;
    message = '設定をリセットしました';
  }

  async function startEncoding() {
    if (!file) return;
    message = '';
    errorLogs = []; // Clear error logs when starting new encoding
    encoding = true;
    paused = false;
    abortController = new AbortController();
    
    try {
      // Note: Audio codec switching is handled by reactive block (lines 67-90)
      // No need to manually switch here - the reactive block ensures the codec
      // is already correct based on quality level before encoding starts

      let width: number | undefined;
      let height: number | undefined;

      if (resolutionMode === 'original') {
        // Keep original resolution - don't specify width/height
        width = undefined;
        height = undefined;
      } else if (resolutionMode === 'preset') {
        const preset = resolutionPresets[resolutionPreset];
        if (preset && sourceFileAnalyzed && originalWidth > 0 && originalHeight > 0) {
          const dims = calculateDimensionsFromLongestEdge(preset.longestEdge, originalWidth, originalHeight);
          width = dims.width;
          height = dims.height;
        } else {
          // Fallback if file not analyzed yet
          width = 1920;
          height = 1080;
        }
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

      const videoBitrate = calculateBitrate(true);
      const audioBitrate = calculateBitrate(false);

      const config = {
        video: { 
          codec: videoCodec, 
          container: containerFormat,
          width: width, 
          height: height, 
          bitrate: videoBitrate, 
          framerate: framerate,
          framerateMode: framerateMode
        },
        audio: { 
          codec: audioCodec, 
          sampleRate: 44100, 
          numberOfChannels: 2, 
          bitrate: audioBitrate 
        }
      };

      const start = performance.now();
      await encodeToFile(file, config, (progress?: {loading?: number, encoding?: number, overall?: number}, stats?: { fps: number, elapsedMs: number, etaMs?: number }, metadata?: any) => {
        // Update separate progress bars
        if (progress) {
          if (progress.loading !== undefined) loadingProgressPct = progress.loading;
          if (progress.encoding !== undefined) encodingProgressPct = progress.encoding;
          if (progress.overall !== undefined) progressPct = progress.overall;
        }
        if (stats) { 
          fps = stats.fps; 
          elapsedMs = stats.elapsedMs;
          etaMs = stats.etaMs ?? 0;
        }
        // Capture source file metadata when available
        if (metadata && metadata.videoFormat && !sourceFileAnalyzed) {
          originalWidth = metadata.videoFormat.width || 0;
          originalHeight = metadata.videoFormat.height || 0;
          originalFramerate = metadata.videoFormat.framerate || 0;
          originalVideoBitrate = metadata.videoFormat.bitrate || 0;
          if (metadata.audioFormat) {
            originalAudioBitrate = metadata.audioFormat.bitrate || 0;
          }
          sourceFileAnalyzed = true;
        }
      }, abortController.signal);

      const end = performance.now();
      const result = {
        process_time_ms: Math.round(end - start),
        source_size_byte: file.size,
        output_size_byte: 0,
        avg_fps: fps
      };

      message = `エンコードが完了しました (処理時間: ${result.process_time_ms}ms, 平均FPS: ${result.avg_fps.toFixed(1)})`;
    } catch (error: any) {
      // Handle errors, including AbortError when user cancels file save dialog or stops encoding
      if (error.name === 'AbortError') {
        if (abortController?.signal.aborted) {
          message = 'エンコードが中止されました';
          console.log('Encoding was stopped by user');
        } else {
          message = 'ファイル保存がキャンセルされました';
          console.log('User cancelled file save dialog');
        }
      } else {
        message = `エラーが発生しました: ${error.message}`;
        console.error('Encoding error:', error);
      }
    } finally {
      // Always reset encoding state to allow user to retry
      encoding = false;
      paused = false;
      abortController = null;
    }
  }

  function stopEncoding() {
    if (abortController) {
      abortController.abort();
      message = 'エンコードを中止しています...';
    }
  }

  onMount(() => {
    presets = loadPresets();
    
    // Detect Firefox browser
    isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    
    // Intercept console.error to capture error logs
    const originalConsoleError = console.error;
    console.error = function(...args) {
      // Filter out non-critical MP4Box parsing errors
      // These are recoverable errors that don't affect encoding success
      const errorMessage = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      // Check for BoxParser error that indicates video seeking limitation
      if (/\[BoxParser\].*Box of type.*has a size.*greater than its container size/i.test(errorMessage)) {
        // Set warning flag for seeking limitation
        showSeekWarning = true;
      }
      
      // Patterns for non-critical MP4Box errors to suppress
      const suppressPatterns = [
        /\[BoxParser\].*Box of type.*has a size.*greater than its container size/i,
        /\[BoxParser\].*box.*size/i
      ];
      
      const shouldSuppress = suppressPatterns.some(pattern => pattern.test(errorMessage));
      
      if (!shouldSuppress) {
        // Call original console.error for non-suppressed errors
        originalConsoleError.apply(console, args);
        
        // Add to error logs with timestamp
        const timestamp = new Date().toLocaleTimeString('ja-JP');
        errorLogs = [...errorLogs, `[${timestamp}] ${errorMessage}`];
      }
      // Suppressed errors are silently ignored as they're recoverable
    };
    
    // Cleanup: restore original console.error when component is destroyed
    return () => {
      console.error = originalConsoleError;
    };
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
    background: var(--color-background);
    padding: 20px;
  }

  .container {
    max-width: 960px;
    margin: 0 auto;
    background: var(--color-surface);
    padding: 24px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  h1 {
    margin-bottom: 24px;
    color: var(--color-text);
  }

  .dropzone {
    border: 2px dashed var(--color-border);
    padding: 40px;
    text-align: center;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;
    margin-bottom: 24px;
    background: var(--color-surface);
  }

  .dropzone:hover {
    border-color: var(--color-primary);
    background: var(--color-progressBg);
  }

  .dropzone input {
    display: none;
  }

  .dropzone p {
    color: var(--color-textSecondary);
    margin-top: 8px;
  }

  .panel {
    margin-bottom: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--color-border);
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
    color: var(--color-text);
    min-width: 100px;
  }

  .row input,
  .row select {
    flex: 1;
    min-width: 200px;
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 14px;
    background: var(--color-surface);
    color: var(--color-text);
  }

  .row input:focus,
  .row select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(41, 121, 255, 0.1);
  }

  .progress {
    height: 8px;
    background: var(--color-progressBg);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .progress > div {
    height: 100%;
    background: var(--color-primary);
    width: 0%;
    transition: width 0.2s;
  }

  button {
    padding: 10px 16px;
    background: var(--color-primary);
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
    background: var(--color-primaryHover);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--color-border);
  }

  p {
    color: var(--color-textSecondary);
    font-size: 14px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--color-primary);
  }

  .header h1 {
    margin: 0;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--color-primary);
  }

  .row input[type="number"] {
    flex: 0 1 150px;
  }

  .preset-toggle {
    margin-bottom: 16px;
  }

  .error-logs {
    background: var(--color-surface);
    border: 1px solid var(--color-error);
    border-radius: 4px;
    padding: 12px;
    margin-top: 16px;
  }

  .error-logs-toggle {
    background: var(--color-error);
    color: white;
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    margin-bottom: 12px;
    width: 100%;
  }

  .error-logs-toggle:hover {
    background: var(--color-error);
    opacity: 0.9;
  }

  .error-logs-content {
    max-height: 200px;
    overflow-y: auto;
    background: var(--color-background);
    padding: 8px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--color-text);
  }

  .error-log-item {
    margin-bottom: 4px;
    color: var(--color-error);
  }

  .footer {
    margin-top: 32px;
    padding: 20px 0;
    border-top: 1px solid var(--color-border);
    text-align: center;
    color: var(--color-textSecondary);
    font-size: 14px;
  }

  .footer p {
    margin: 0;
  }

  .footer a {
    color: var(--color-primary);
    text-decoration: none;
    transition: opacity 0.2s;
  }

  .footer a:hover {
    opacity: 0.7;
    text-decoration: underline;
  }

  .browser-warning {
    background: var(--color-warningBg);
    border: 2px solid var(--color-warningBorder);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 24px;
    color: var(--color-warningText);
  }

  .browser-warning h3 {
    margin: 0 0 8px 0;
    color: var(--color-warningText);
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .browser-warning p {
    margin: 8px 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-warningText);
  }

  .browser-warning strong {
    font-weight: 600;
    color: var(--color-warningText);
  }

  .browser-warning ul {
    margin: 8px 0 8px 20px;
    font-size: 14px;
    color: var(--color-warningText);
  }

  .browser-warning .close-btn {
    background: transparent;
    border: none;
    color: var(--color-warningText);
    cursor: pointer;
    font-size: 20px;
    padding: 0;
    margin-left: auto;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .browser-warning .close-btn:hover {
    opacity: 1;
  }

  .browser-warning-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

</style>

<div class="container">
  <div class="header">
    <h1>ブラウザ動画エンコーダ</h1>
    <ThemeSwitcher />
  </div>

  {#if isFirefox && showBrowserWarning}
    <div class="browser-warning">
      <div class="browser-warning-header">
        <h3>⚠️ ブラウザ互換性警告</h3>
        <button class="close-btn" on:click={() => showBrowserWarning = false}>×</button>
      </div>
      <p>
        <strong>Firefoxでは既知の問題があります。</strong>
        WebCodecs APIの実装に不具合があり、以下のコーデックで正常に動作しない可能性があります:
      </p>
      <ul>
        <li>AV1コーデック - エンコードが100%完了しない</li>
        <li>VP9コーデック - エンコードが100%完了しない</li>
        <li>H.264コーデック - エラーが発生する可能性</li>
      </ul>
      <p>
        <strong>推奨ブラウザ:</strong> Google Chrome または Microsoft Edge の最新版をご使用ください。
      </p>
    </div>
  {/if}

  <!-- Video seeking warning -->
  {#if showSeekWarning}
    <div class="browser-warning">
      <div class="browser-warning-header">
        <h3>⚠️ 動画ファイル警告</h3>
        <button class="close-btn" on:click={() => showSeekWarning = false}>×</button>
      </div>
      <p>
        <strong>この動画ファイルにはシーク情報の問題があります。</strong>
      </p>
      <p style="font-weight: bold; margin-top: 8px;">
        動画のシークができません
      </p>
      <p style="font-size: 14px; margin-top: 8px;">
        エンコード処理は正常に完了しますが、出力された動画ファイルで特定の位置へのシーク（早送り・巻き戻し）が正常に動作しない可能性があります。
      </p>
    </div>
  {/if}

  <div class="dropzone" on:click={() => document.getElementById('fileInput')?.click()}>
    <input type="file" id="fileInput" accept="video/mp4" on:change={pickFile} />
    <p>MP4ファイルをドラッグ&ドロップ または クリックして選択</p>
  </div>

  {#if file}
    <div class="panel">
      <p>選択: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>
      {#if sourceFileAnalyzed}
        <p style="color: #666; font-size: 12px; margin-top: 8px;">
          元ファイル情報: {originalWidth}×{originalHeight} @ {originalFramerate.toFixed(1)}fps
          {#if originalVideoBitrate > 0}
            | 映像: {(originalVideoBitrate / 1000000).toFixed(1)}Mbps
          {/if}
          {#if originalAudioBitrate > 0}
            | 音声: {(originalAudioBitrate / 1000).toFixed(0)}Kbps
          {/if}
        </p>
      {/if}
    </div>
  {/if}

  {#if presets.length > 0}
    <!-- File Information Section -->
    {#if sourceFileAnalyzed && file}
      <div class="panel">
        <h3 class="section-title">ファイル情報</h3>
        <div style="color: #666; font-size: 13px; padding: 8px 0;">
          <p style="margin: 4px 0;"><strong>入力解像度:</strong> {originalWidth} × {originalHeight}px</p>
          <p style="margin: 4px 0;"><strong>フレームレート:</strong> {originalFramerate.toFixed(1)}fps</p>
          {#if originalVideoBitrate > 0}
            <p style="margin: 4px 0;"><strong>映像ビットレート:</strong> {(originalVideoBitrate / 1000000).toFixed(1)}Mbps</p>
          {/if}
          {#if originalAudioBitrate > 0}
            <p style="margin: 4px 0;"><strong>音声ビットレート:</strong> {(originalAudioBitrate / 1000).toFixed(0)}Kbps</p>
          {/if}
        </div>
        {#if outputWidth > 0 && outputHeight > 0}
          <div style="color: #2196F3; font-size: 13px; padding: 8px 0; border-top: 1px solid #e0e0e0; margin-top: 8px;">
            <p style="margin: 4px 0;"><strong>出力解像度:</strong> {outputWidth} × {outputHeight}px</p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Preset Selection -->
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
        <button 
          type="button" 
          on:click={toggleDetailedSettings} 
          style="width: 100%; padding: 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          {showDetailedSettings ? '詳細設定を閉じる（設定をリセット）' : '詳細設定を開く'}
        </button>
      </div>
      
      <div class="row">
        <button 
          type="button" 
          on:click={resetSettings} 
          style="width: 100%; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 8px;"
        >
          設定をリセット
        </button>
      </div>
    </div>

    {#if showDetailedSettings}
      <!-- Encoding Settings Section -->
      <div class="panel">
        <h3 class="section-title">エンコード設定</h3>
        
        <div class="row">
          <label>映像コーデック:</label>
          <select bind:value={videoCodec} style="flex: 1;">
            <optgroup label="H.264 (AVC)">
              <option value="avc1.640028">H.264 High (最高画質・互換性良)</option>
              <option value="avc1.4d001f">H.264 Main (高画質・互換性最良)</option>
              <option value="avc1.42001f">H.264 Baseline L3.1 (標準画質・旧デバイス対応)</option>
              <option value="avc1.42001e">H.264 Baseline L3.0 (低解像度・最高互換性)</option>
            </optgroup>
            <optgroup label="H.265 (HEVC)">
              <option value="hev1.1.6.L93.B0">H.265 Main (高効率・新デバイス)</option>
              <option value="hvc1.1.6.L93.B0">H.265 Main hvc1 (Apple互換性向上)</option>
            </optgroup>
            <optgroup label="VP9">
              <option value="vp09.00.31.08">VP9 Profile 0 (WebM標準)</option>
              <option value="vp09.00.41.08">VP9 Profile 0 L4.1 (高解像度対応)</option>
            </optgroup>
            <optgroup label="AV1">
              <option value="av01.0.05M.08">AV1 Main L3.1 (最新・高効率)</option>
              <option value="av01.0.04M.08">AV1 Main L3.0 (標準解像度)</option>
            </optgroup>
          </select>
        </div>
        
        <p style="color: #666; font-size: 11px; margin-left: 112px; margin-top: -8px;">
          {#if videoCodec.startsWith('avc1.64')}
            High: 最高画質のH.264プロファイル。ほとんどのデバイスで再生可能
          {:else if videoCodec.startsWith('avc1.4d')}
            Main: バランスの良いH.264プロファイル。互換性が最も高い
          {:else if videoCodec === 'avc1.42001f'}
            Baseline L3.1: 標準画質のH.264。旧デバイスとの互換性重視
          {:else if videoCodec === 'avc1.42001e'}
            Baseline L3.0: 低解像度向けH.264。最高の互換性
          {:else if videoCodec.startsWith('hev1')}
            H.265 (hev1): H.264より約50%高効率。比較的新しいデバイスが必要
          {:else if videoCodec.startsWith('hvc1')}
            H.265 (hvc1): hev1と同等だがAppleデバイスでの互換性が向上
          {:else if videoCodec.startsWith('vp09')}
            VP9: Googleが開発した高効率コーデック。WebMコンテナで使用
          {:else if videoCodec.startsWith('av01')}
            AV1: 最新の高効率コーデック。H.264の約30%のサイズで同等画質
          {/if}
        </p>
        
        <div class="row">
          <label>音声コーデック:</label>
          <select bind:value={audioCodec}>
            <option value="mp4a.40.2">AAC-LC</option>
            <option value="mp4a.40.5">AAC-HE</option>
            <option value="opus">Opus</option>
          </select>
        </div>
        
        <div class="row">
          <label>コンテナ形式:</label>
          <select bind:value={containerFormat}>
            <option value="mp4">MP4</option>
            <option value="mov">MOV</option>
            <option value="webm">WebM</option>
          </select>
        </div>
        
        <div class="row">
          <label>映像品質:</label>
          <select bind:value={qualityLevel}>
            <option value="最高">最高 (元ファイルと同等)</option>
            <option value="高">高 (元の80%)</option>
            <option value="中">中 (元の60%) - 推奨</option>
            <option value="低">低 (元の40%)</option>
            <option value="最低">最低 (元の25%)</option>
            <option value="カスタム">カスタム</option>
          </select>
        </div>

        {#if qualityLevel === 'カスタム'}
          <div class="row">
            <label>映像ビットレート (Kbps):</label>
            <input type="number" bind:value={customVideoBitrate} min="100" max="50000" step="100" />
          </div>
        {:else if sourceFileAnalyzed}
          <p style="color: #666; font-size: 12px; margin-left: 112px; margin-top: -8px;">
            推定映像ビットレート: {(estimatedVideoBitrate / 1000000).toFixed(1)}Mbps
            {#if videoCodec.startsWith('vp09')}
              (VP9コーデックにより最適化)
            {:else if videoCodec.startsWith('av01')}
              (AV1コーデックにより最適化)
            {/if}
          </p>
        {/if}
        
        <div class="row">
          <label>音声品質:</label>
          <select bind:value={audioQualityLevel}>
            <option value="最高">最高 (192Kbps)</option>
            <option value="高">高 (160Kbps)</option>
            <option value="中">中 (128Kbps) - 推奨</option>
            <option value="低">低 (96Kbps)</option>
            <option value="最低">最低 ({audioCodec === 'opus' ? '64' : '96'}Kbps)</option>
          </select>
        </div>

        {#if qualityLevel === 'カスタム'}
          <div class="row">
            <label>音声ビットレート (Kbps):</label>
            <input type="number" bind:value={customAudioBitrate} min="32" max="320" step="8" />
          </div>
        {:else if sourceFileAnalyzed}
          <p style="color: #666; font-size: 12px; margin-left: 112px; margin-top: -8px;">
            推定音声ビットレート: {(estimatedAudioBitrate / 1000).toFixed(0)}Kbps
            {#if audioCodec.startsWith('mp4a')}
              <br/>※ AACコーデックは96/128/160/192Kbpsの4段階のみ対応
            {/if}
          </p>
        {/if}
      </div>

      <!-- Resolution Settings Section -->
      <div class="panel">
        <h3 class="section-title">解像度設定</h3>
        
        <div class="row">
          <label>解像度モード:</label>
          <select bind:value={resolutionMode}>
            <option value="original">元の解像度を保持</option>
            <option value="preset">長辺プリセット</option>
            <option value="manual">手動指定(幅×高さ)</option>
            <option value="width-only">幅のみ指定</option>
            <option value="height-only">高さのみ指定</option>
          </select>
        </div>

        {#if resolutionMode === 'preset'}
          <div class="row">
            <label>長辺サイズ:</label>
            <select bind:value={resolutionPreset}>
              {#each Object.entries(resolutionPresets) as [key, preset]}
                {#if sourceFileAnalyzed && originalWidth > 0 && originalHeight > 0}
                  {@const maxEdge = Math.max(originalWidth, originalHeight)}
                  {@const isUpscale = preset.longestEdge > maxEdge}
                  <option value={key} disabled={isUpscale}>
                    {preset.label} {isUpscale ? '(元ファイルより大きい)' : ''}
                  </option>
                {:else}
                  <option value={key}>{preset.label}</option>
                {/if}
              {/each}
            </select>
          </div>
          {#if sourceFileAnalyzed && resolutionPresets[resolutionPreset]}
            {@const maxEdge = Math.max(originalWidth, originalHeight)}
            {@const isUpscale = resolutionPresets[resolutionPreset].longestEdge > maxEdge}
            {#if isUpscale}
              <p style="color: #f44336; font-size: 12px; margin-top: -8px;">⚠️ 選択した解像度は元ファイルより大きいため、画質が劣化する可能性があります</p>
            {/if}
          {/if}
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
      </div>

      <!-- Framerate Settings Section -->
      <div class="panel">
        <h3 class="section-title">フレームレート設定</h3>
        
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
            <input 
              type="number" 
              bind:value={framerate} 
              min="1" 
              max={sourceFileAnalyzed && originalFramerate > 0 ? originalFramerate : 120} 
              step="1" 
            />
          </div>
          {#if sourceFileAnalyzed && originalFramerate > 0 && framerate > originalFramerate}
            <p style="color: #f44336; font-size: 12px; margin-top: -8px;">⚠️ フレームレートを元ファイル({originalFramerate.toFixed(1)}fps)より高く設定しても品質は向上しません</p>
          {/if}
        {/if}
      </div>
    {/if}

    <div class="panel">
      <button on:click={startEncoding} disabled={!file || encoding}>エンコード開始</button>
    </div>

    {#if encoding}
      <div class="panel">
        <!-- Loading/Demuxing Progress -->
        <div style="margin-bottom: 16px;">
          <p style="margin-bottom: 4px; font-size: 14px; color: #666;">ファイル読み込み・解析</p>
          <div class="progress"><div style="width:{loadingProgressPct}%"></div></div>
          <p style="font-size: 13px;">読み込み進捗: {Math.round(loadingProgressPct)}%</p>
        </div>
        
        <!-- Encoding Progress -->
        <div style="margin-bottom: 16px;">
          <p style="margin-bottom: 4px; font-size: 14px; color: #666;">エンコード処理</p>
          <div class="progress"><div style="width:{encodingProgressPct}%"></div></div>
          <p style="font-size: 13px;">エンコード進捗: {Math.round(encodingProgressPct)}%</p>
        </div>
        
        <!-- Overall Progress -->
        <div style="margin-bottom: 16px;">
          <p style="margin-bottom: 4px; font-size: 14px; font-weight: bold;">全体進捗</p>
          <div class="progress"><div style="width:{progressPct}%"></div></div>
          <p style="font-size: 14px; font-weight: bold;">全体: {Math.round(progressPct)}%</p>
        </div>
        
        <p>FPS: {fps > 0 ? fps.toFixed(1) : '-'} | 経過: {(elapsedMs/1000).toFixed(1)}s</p>
        {#if etaMs > 0 && progressPct < 100}
          <p>推定残り時間: {(etaMs/1000).toFixed(1)}s</p>
        {/if}
        <div class="row" style="margin-top: 12px;">
          <button 
            on:click={stopEncoding} 
            style="background: #f44336; color: white; width: 100%;"
          >
            エンコード中止
          </button>
        </div>
      </div>
    {/if}

    {#if errorLogs.length > 0}
      <div class="error-logs">
        <button 
          class="error-logs-toggle" 
          on:click={() => showErrorLogs = !showErrorLogs}
        >
          {showErrorLogs ? 'エラーログを非表示' : `エラーログを表示 (${errorLogs.length}件)`}
        </button>
        {#if showErrorLogs}
          <div class="error-logs-content">
            {#each errorLogs as log}
              <div class="error-log-item">{log}</div>
            {/each}
          </div>
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
  
  <footer class="footer">
    <p>
      © 2024 Browser Video Encoder | 
      <a href="https://github.com/Shimamura-Kouki/2nd_IT-Project_BrowserVideoEncoding" target="_blank" rel="noopener noreferrer">
        GitHub Repository
      </a>
    </p>
  </footer>
</div>

