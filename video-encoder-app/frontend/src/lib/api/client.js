const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/';

export async function getPresets() {
    const res = await fetch(`${API_BASE}?action=preset_index`, { headers: { 'Accept': 'application/json' } });
    return res.json();
}

export async function getPosts(limit = 10) {
    const res = await fetch(`${API_BASE}?action=post_index&limit=${limit}`, { headers: { 'Accept': 'application/json' } });
    return res.json();
}

export async function postStore(body) {
    const res = await fetch(`${API_BASE}?action=post_store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`POST failed: ${res.status}`);
    return res.json();
}