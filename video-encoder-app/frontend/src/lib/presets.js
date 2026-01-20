const STORAGE_KEY = 'video-encoder-presets';

const DEFAULT_PRESETS = [
    { name: '1080p30 (5Mbps)', config_json: { codec: 'avc1.42e01e', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30, audio_bitrate: 128_000 } },
    { name: '720p30 (3Mbps)', config_json: { codec: 'avc1.42e01e', width: 1280, height: 720, bitrate: 3_000_000, framerate: 30, audio_bitrate: 128_000 } }
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
