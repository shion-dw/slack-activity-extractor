# Repository Guidelines

本ドキュメントは slack-activity-extractor へのコントリビュート指針です。短時間で把握できるよう、プロジェクト特有の運用に絞って記載します。

## Project Structure & Module Organization
- `src/cli.ts`: CLI エントリーポイント（`commander`）。
- `src/slack/*`: Slack API 連携（`SlackClient`, `ChannelDetector`）。
- `src/processing/MessageProcessor.ts`: 抽出・文脈メッセージ処理。
- `src/output/OutputGenerator.ts`: JSON/Markdown 生成。
- `src/config/ConfigManager.ts`: `.env`/`config.json` 読み込みと検証。
- `src/utils/logger.ts`, `src/errors.ts`, `src/types.ts`: 共通ユーティリティ。
- `dist/`: ビルド済み成果物（配布/実行用）。
- `config.json`/`config.sample.json`, `.env`/`.env.sample`: 設定とサンプル。

## Build, Test, and Development Commands
- `yarn build`: TypeScript を `dist/` にコンパイル。
- `yarn dev`: TypeScript を直接実行（`ts-node`）。開発時の動作確認に使用。
- `yarn start`: ビルド済み CLI を起動（`node dist/cli.js`）。
- `yarn lint`: ESLint による静的解析。
- `yarn format`: Prettier による整形。
実行例: `node dist/cli.js --start-date 2024-01-01 --format markdown`

## Coding Style & Naming Conventions
- 言語: TypeScript（ESM）。インデント 2 スペース。
- ルール: ESLint + Prettier（`npm run lint`/`format` を通す）。
- ファイル: ディレクトリはケバブ/ローワー、クラス実装ファイルは `PascalCase.ts`、共通は `camelCase.ts` を目安。
- 命名: クラス `PascalCase`、関数/変数 `camelCase`、型/インターフェース `PascalCase`。

## Testing Guidelines
- 現状、自動テストは未導入。追加する場合は `tests/` に `*.test.ts` を配置し、`vitest` もしくは `jest` を推奨（`yarn test` スクリプト追加）。
- テスト名は対象モジュールに対応（例: `MessageProcessor.test.ts`）。

## Commit & Pull Request Guidelines
- コミット: Conventional Commits を推奨（例: `feat: add channel detection for private groups`、`fix: handle Slack rate limits`）。
- PR 必須項目: 目的の要約、変更点、動作確認方法、影響範囲、関連 Issue リンク。必要に応じて CLI 実行例やスクリーンショットを添付。
- CI/静的解析を通ること（`lint`/`format`）。

## Security & Configuration Tips
- `.env` に機密（`SLACK_BOT_TOKEN` 等）を保存し、コミット禁止。共有は行わない。
- 設定は `config.json` を利用（不要なら削除可）。サンプルを更新したら実体も同期。
- 必要スコープ例: `channels:history`, `channels:read`, `groups:read`, `users:read`。429（レート制限）考慮済み。

### ファイル名テンプレート
- `outputFileName` は `{datetime}`（例: `slack-activity-{datetime}.md`）。後方互換で `{date}` も置換されます。
