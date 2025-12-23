# Frontend (Svelte + WebCodecs)

## セットアップ
```bash
npm install
npm run dev -- --host
```

## 環境変数
- `VITE_API_BASE` (任意): APIのベースURL。未指定時は `/api/` を使用。

## 主な実装
- `src/lib/core/demuxer.js`: mp4box.jsで入力をデマックスし、デコーダへ供給。
- `src/lib/core/encoder.js`: WebCodecsで再エンコードし、mp4-muxer経由で FileSystem API へストリーム保存。
- `src/App.svelte`: UIと進捗表示、共有API呼び出し。

## 注意
- WebCodecs と FileSystem Access は Secure Context が必要。localhost 以外は HTTPS を用意。
