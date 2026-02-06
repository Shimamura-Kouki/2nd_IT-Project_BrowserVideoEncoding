const STORAGE_KEY = 'video-encoder-presets';

const DEFAULT_PRESETS = [
    // QP品質モードプリセット (デフォルト推奨)
    { name: 'QP 高品質 1080p60', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 1920, height: 1080, bitrateMode: 'quantizer', quantizer: 23, framerate: 60, audio_bitrate: 192_000 } },
    { name: 'QP 標準品質 1080p30', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 1920, height: 1080, bitrateMode: 'quantizer', quantizer: 28, framerate: 30, audio_bitrate: 128_000 } },
    { name: 'QP 高品質 720p60', config_json: { container: 'mp4', codec: 'avc1.42001f', audioCodec: 'mp4a.40.2', width: 1280, height: 720, bitrateMode: 'quantizer', quantizer: 23, framerate: 60, audio_bitrate: 128_000 } },
    { name: 'QP 標準品質 720p30', config_json: { container: 'mp4', codec: 'avc1.42001f', audioCodec: 'mp4a.40.2', width: 1280, height: 720, bitrateMode: 'quantizer', quantizer: 28, framerate: 30, audio_bitrate: 128_000 } },
    
    // 元ファイル維持プリセット
    { name: '元ファイルを維持 (MP4 QP)', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', preserveOriginal: true, bitrateMode: 'quantizer', quantizer: 28, framerate: 30, audio_bitrate: 128_000 } },
    { name: '元ファイルを維持 (WebM QP)', config_json: { container: 'webm', codec: 'vp09.00.31.08', audioCodec: 'opus', preserveOriginal: true, bitrateMode: 'quantizer', quantizer: 28, framerate: 30, audio_bitrate: 128_000 } },
    
    // ビットレートモードプリセット (従来型)
    { name: 'VBR 4K60', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 3840, height: 2160, bitrateMode: 'variable', bitrate: 20_000_000, framerate: 60, audio_bitrate: 192_000 } },
    { name: 'VBR 4K30', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 3840, height: 2160, bitrateMode: 'variable', bitrate: 15_000_000, framerate: 30, audio_bitrate: 192_000 } },
    { name: 'VBR 1440p60', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 2560, height: 1440, bitrateMode: 'variable', bitrate: 12_000_000, framerate: 60, audio_bitrate: 160_000 } },
    { name: 'VBR 1440p30', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 2560, height: 1440, bitrateMode: 'variable', bitrate: 8_000_000, framerate: 30, audio_bitrate: 160_000 } },
    { name: 'VBR 1080p60', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 1920, height: 1080, bitrateMode: 'variable', bitrate: 8_000_000, framerate: 60, audio_bitrate: 128_000 } },
    { name: 'VBR 1080p30', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 1920, height: 1080, bitrateMode: 'variable', bitrate: 5_000_000, framerate: 30, audio_bitrate: 128_000 } },
    { name: 'VBR 720p60', config_json: { container: 'mp4', codec: 'avc1.42001f', audioCodec: 'mp4a.40.2', width: 1280, height: 720, bitrateMode: 'variable', bitrate: 5_000_000, framerate: 60, audio_bitrate: 128_000 } },
    { name: 'VBR 720p30', config_json: { container: 'mp4', codec: 'avc1.42001f', audioCodec: 'mp4a.40.2', width: 1280, height: 720, bitrateMode: 'variable', bitrate: 3_000_000, framerate: 30, audio_bitrate: 128_000 } },
    { name: 'VBR 480p30', config_json: { container: 'mp4', codec: 'avc1.42001e', audioCodec: 'mp4a.40.2', width: 854, height: 480, bitrateMode: 'variable', bitrate: 1_500_000, framerate: 30, audio_bitrate: 96_000 } },
];

export function loadPresets() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_PRESETS;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (_e) {
        // fallback to defaults on parse/storage errors
    }
    return DEFAULT_PRESETS;
}

export function savePresets(list) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (_e) {
        // ignore storage failures
    }
}
