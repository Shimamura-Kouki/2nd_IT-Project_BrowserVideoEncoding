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
    if (env.SSL_KEY_PATH && env.SSL_CERT_PATH) {
        // ファイルの存在チェック
        const keyExists = fs.existsSync(env.SSL_KEY_PATH);
        const certExists = fs.existsSync(env.SSL_CERT_PATH);
        
        if (keyExists && certExists) {
            try {
                httpsConfig = {
                    key: fs.readFileSync(env.SSL_KEY_PATH),
                    cert: fs.readFileSync(env.SSL_CERT_PATH),
                };
                console.log('✅ HTTPS enabled with certificates from .env.local');
                console.log(`   Key: ${env.SSL_KEY_PATH}`);
                console.log(`   Cert: ${env.SSL_CERT_PATH}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('❌ Error reading SSL certificates:', errorMessage);
                console.warn('   Falling back to HTTP mode.');
            }
        } else {
            console.warn('⚠️  SSL certificate paths are set in .env.local but files not found:');
            if (!keyExists) console.warn(`   ❌ Key file not found: ${env.SSL_KEY_PATH}`);
            if (!certExists) console.warn(`   ❌ Cert file not found: ${env.SSL_CERT_PATH}`);
            console.warn('   Falling back to HTTP mode.');
            console.warn('   Please verify the file paths in .env.local');
        }
    } else {
        console.log('ℹ️  HTTPS not configured (no .env.local with SSL paths).');
        console.log('   Running in HTTP mode on http://localhost:5173');
        console.log('   For HTTPS with Tailscale, see .env.local.example');
    }

    return {
        plugins: [svelte()],
        base: './',
        server: {
            port: 5173,
            host: true,
            // Tailscale hostname pattern: *.ts.net を許可
            // Allow any Tailscale hostname (*.ts.net) and localhost
            allowedHosts: [
                '.ts.net',  // Tailscale のすべてのホスト名を許可
                'localhost',
                '127.0.0.1'
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