# Frontend (Svelte + WebCodecs)

## セットアップ

```bash
npm install
npm run dev -- --host
```

## 主な実装

- `src/lib/core/demuxer.js`: mp4box.jsで入力をデマックスし、デコーダへ供給。
- `src/lib/core/encoder.js`: WebCodecsで再エンコードし、mp4-muxer経由で FileSystem API へストリーム保存。
- `src/App.svelte`: UIと進捗表示。
- `src/lib/presets.js`: エンコードプリセットの管理（LocalStorageに保存）。

## 注意

- WebCodecs と FileSystem Access は Secure Context が必要。localhost 以外は HTTPS を用意。
- このアプリは完全にブラウザ内で動作する静的サイトです。サーバーサイド処理は不要です。
