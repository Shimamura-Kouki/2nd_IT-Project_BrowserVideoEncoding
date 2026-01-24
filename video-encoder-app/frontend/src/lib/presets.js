const STORAGE_KEY = 'video-encoder-presets';

const DEFAULT_PRESETS = [
    // 元ファイル維持プリセット
    { name: '元ファイルを維持 (MP4)', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', preserveOriginal: true, bitrate: 5_000_000, framerate: 30, audio_bitrate: 128_000 } },
    { name: '元ファイルを維持 (WebM)', config_json: { container: 'webm', codec: 'vp09.00.31.08', audioCodec: 'opus', preserveOriginal: true, bitrate: 4_000_000, framerate: 30, audio_bitrate: 128_000 } },
    
    // Resolution/Framerate Presets (codec-agnostic, bitrate controlled by quality setting)
    { name: '4K60', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 3840, height: 2160, bitrate: 20_000_000, framerate: 60, audio_bitrate: 192_000 } },
    { name: '4K30', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 3840, height: 2160, bitrate: 15_000_000, framerate: 30, audio_bitrate: 192_000 } },
    { name: '1440p60', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 2560, height: 1440, bitrate: 12_000_000, framerate: 60, audio_bitrate: 160_000 } },
    { name: '1440p30', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 2560, height: 1440, bitrate: 8_000_000, framerate: 30, audio_bitrate: 160_000 } },
    { name: '1080p60', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 1920, height: 1080, bitrate: 8_000_000, framerate: 60, audio_bitrate: 128_000 } },
    { name: '1080p30', config_json: { container: 'mp4', codec: 'avc1.640028', audioCodec: 'mp4a.40.2', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30, audio_bitrate: 128_000 } },
    { name: '720p60', config_json: { container: 'mp4', codec: 'avc1.42001f', audioCodec: 'mp4a.40.2', width: 1280, height: 720, bitrate: 5_000_000, framerate: 60, audio_bitrate: 128_000 } },
    { name: '720p30', config_json: { container: 'mp4', codec: 'avc1.42001f', audioCodec: 'mp4a.40.2', width: 1280, height: 720, bitrate: 3_000_000, framerate: 30, audio_bitrate: 128_000 } },
    { name: '480p30', config_json: { container: 'mp4', codec: 'avc1.42001e', audioCodec: 'mp4a.40.2', width: 854, height: 480, bitrate: 1_500_000, framerate: 30, audio_bitrate: 96_000 } },
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
