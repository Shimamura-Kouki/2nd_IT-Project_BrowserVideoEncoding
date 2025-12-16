/**
 * API クライアント
 * バックエンドAPIとの通信を担当するモジュール
 */

// APIのベースURL（環境に応じて変更）
const API_BASE_URL = '../api';

/**
 * プリセット一覧を取得
 * @returns {Promise<Array>} プリセットの配列
 */
export async function fetchPresets() {
    try {
        const response = await fetch(`${API_BASE_URL}/presets`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data;
    } catch (error) {
        console.error('プリセット取得エラー:', error);
        throw error;
    }
}

/**
 * 投稿一覧を取得
 * @param {number} limit - 取得件数
 * @returns {Promise<Array>} 投稿の配列
 */
export async function fetchPosts(limit = 10) {
    try {
        const response = await fetch(`${API_BASE_URL}/posts?limit=${limit}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data;
    } catch (error) {
        console.error('投稿取得エラー:', error);
        throw error;
    }
}

/**
 * 新規ベンチマーク投稿を作成
 * @param {Object} postData - 投稿データ
 * @param {string} postData.user_name - ユーザー名
 * @param {string} postData.comment - コメント
 * @param {Object} postData.config_json - エンコード設定
 * @param {Object} postData.benchmark_result - ベンチマーク結果
 * @returns {Promise<Object>} レスポンスデータ
 */
export async function createPost(postData) {
    try {
        const response = await fetch(`${API_BASE_URL}/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(postData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data;
    } catch (error) {
        console.error('投稿作成エラー:', error);
        throw error;
    }
}

/**
 * データをHTMLエスケープ（XSS対策）
 * @param {string} text - エスケープするテキスト
 * @returns {string} エスケープされたテキスト
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 日時フォーマット
 * @param {string} dateString - 日時文字列
 * @returns {string} フォーマットされた日時
 */
export function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

/**
 * ファイルサイズをフォーマット
 * @param {number} bytes - バイト数
 * @returns {string} フォーマットされたサイズ
 */
export function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    } else if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else {
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
}
