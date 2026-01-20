import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
    plugins: [svelte()],
    base: '/2nd_IT-Project_BrowserVideoEncoding/',
    server: {
        port: 5173,
        https: false
    },
    build: {
        target: 'esnext',
        outDir: '../docs'
    }
});