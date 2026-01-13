# Video Encoder App

ブラウザ完結型動画エンコードWebアプリケーション

## 概要
このアプリケーションは、WebCodecs APIとFileSystem Access APIを使用して、ブラウザ上で直接動画のエンコード処理を行います。サーバー側での処理が不要なため、プライバシーが保護され、サーバーの計算コストも削減できます。

## ディレクトリ構成
```
video-encoder-app/
├── frontend/           # Svelte + WebCodecs フロントエンド
├── backend/            # PHP REST API バックエンド
├── export-metadata.sh  # 動画メタデータをXML形式でエクスポートするツール
├── compare-metadata.sh # ソースと出力の動画メタデータを比較するツール
├── METADATA_TOOLS.md   # メタデータツールの使用方法
├── AUDIO_TRACK_FIX.md  # オーディオトラック問題の修正ドキュメント
└── 実装履歴.md         # 実装履歴
```

## クイックスタート

### フロントエンド
```bash
cd frontend
npm install
npm run dev
```

詳細は [frontend/README.md](frontend/README.md) を参照してください。

### バックエンド
```bash
cd backend
# PHPサーバーのセットアップ手順はbackend/README.mdを参照
```

## 動画メタデータツール

### 概要
エンコード前後の動画ファイルのメタデータをXML形式で出力・比較するツールを提供しています。これにより、エンコード処理が正しく行われているか検証できます。

### 使い方

#### メタデータのエクスポート
```bash
./export-metadata.sh 画面録画.mp4
# 出力: 画面録画.xml
```

#### ソースと出力の比較
```bash
./compare-metadata.sh 画面録画.mp4 output.mp4
```

このコマンドは以下を実行します：
- 両ファイルのメタデータをXML形式でエクスポート（画面録画.xml、output.xml）
- 両ファイルの詳細なメタデータを表示
- オーディオトラック数を比較し、検証結果を表示

詳細は [METADATA_TOOLS.md](METADATA_TOOLS.md) を参照してください。

## 主な機能
- **ストリーム書き込み**: FileSystem Access APIを使用して、メモリ枯渇を防ぎながら長時間の動画をエンコード
- **WebCodecsエンコード**: ハードウェアアクセラレーションを利用した高速エンコード（H.264, VP9, AV1）
- **ベンチマーク計測**: エンコード時間、平均FPS、圧縮率の自動記録
- **設定共有機能**: エンコード設定とベンチマークをサーバーで共有（バックエンドAPI経由）

## 最近の修正

### オーディオトラック問題の修正
VLCなどのメディアプレイヤーで再生できない問題を修正しました。詳細は以下を参照：
- [AUDIO_TRACK_FIX.md](AUDIO_TRACK_FIX.md) - 修正の詳細
- [FIX_SUMMARY.md](../FIX_SUMMARY.md) - 全体的な修正サマリー

**問題**: ソース動画にオーディオトラックがない場合でも、出力MP4に空のオーディオトラックが作成され、プレイヤーで再生できなかった。

**解決策**: エンコーダーとデマックサーを修正し、ソース動画にオーディオトラックが存在する場合のみ、出力にオーディオトラックを作成するようにしました。

## 対応ブラウザ
- Google Chrome / Microsoft Edge (Chromium系) - 推奨
- WebCodecs APIとFileSystem Access APIをサポートするブラウザ
- Secure Context (HTTPS または localhost) が必要

## 開発者向け情報

### 主要ファイル
- `frontend/src/lib/core/demuxer.js` - MP4デマックス処理
- `frontend/src/lib/core/encoder.js` - WebCodecsエンコード＋ストリーム保存
- `frontend/src/App.svelte` - メインUI

### ビルド
```bash
cd frontend
npm run build
```

### リント
```bash
cd frontend
npm run lint  # 実装されている場合
```

## トラブルシューティング

### VLCで再生できない
1. メタデータ比較ツールを使用して、ソースと出力のトラック構成を確認：
   ```bash
   ./compare-metadata.sh source.mp4 output.mp4
   ```
2. オーディオトラック数が正しいか確認
3. 問題が解決しない場合は、AUDIO_TRACK_FIX.mdを参照

### エンコードが途中で停止する
- ブラウザのメモリ不足の可能性があります
- 短い動画でテストしてください
- ブラウザのコンソールでエラーを確認してください

## ライセンス
このプロジェクトは教育目的で作成されています。

## 関連ドキュメント
- [企画書](../企画書mk2-v1.md)
- [実装仕様（フロントエンド）](../Implementation_Spec_Frontend_Complete_v3.md)
- [実装仕様（バックエンド）](../Implementation_Spec_Backend_Complete.md)
