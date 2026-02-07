import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'fs';

// mode引数を受け取る形に変更するのじゃ
export default defineConfig(({ mode }) => {
    // カレントディレクトリから環境変数を読み込む（''を指定すると接頭辞なしの変数も読める）
    const env = loadEnv(mode, process.cwd(), '');

    // HTTPS設定を作る準備
    let httpsConfig = false;

    // 環境変数にパスが設定されており、かつファイルが存在する場合のみHTTPSを有効化
    if (env.SSL_KEY_PATH && env.SSL_CERT_PATH && fs.existsSync(env.SSL_KEY_PATH) && fs.existsSync(env.SSL_CERT_PATH)) {
        httpsConfig = {
            key: fs.readFileSync(env.SSL_KEY_PATH),
            cert: fs.readFileSync(env.SSL_CERT_PATH),
        };
        console.log('HTTPS enabled with certs from .env.local');
    } else {
        console.warn('Warning: SSL certs not found or not set in .env.local. Falling back to HTTP or auto-generated certs.');
    }

    return {
        plugins: [svelte()],
        base: './',
        server: {
            port: 5173,
            host: true,
            allowedHosts: [
                'thinkbook-14-g6-windows.bass-uaru.ts.net'
            ],
            https: httpsConfig
        },
        build: {
            target: 'esnext',
            outDir: '../docs',
            emptyOutDir: true
        }
    };
});