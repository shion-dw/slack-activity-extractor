slack-activity-extractor
========================

Slack上の特定ユーザーの発言とその前後の文脈メッセージを期間指定で抽出し、JSON/Markdownで保存するCLIツールです。

インストール
------------

- プロジェクト直下に `.env` と必要に応じて `config.json` を作成

`.env` の例は `.env.sample` を参照:

```
SLACK_BOT_TOKEN=xoxb-...
TARGET_USER_ID=U1234567890 # 省略可（トークン所有者）
```

`config.json` の例は `config.sample.json` を参照:

```
{
  "includeChannels": ["general", "team-frontend", "eng-all"], // 省略した場合は指定期間中に発言履歴のあるチャンネル全てが対象となる
  "excludeChannels": ["random"], // includeChannel を省略した場合に、対象から除外したいチャンネルを指定
  "contextMessageCount": 3,
  "defaultDays": 30,
  "outputFormat": "markdown",
  "outputFileName": "slack-activity-{date}.md",
  "outputDir": "outputs",
  "startDate": "2025-01-01", // 任意、CLI指定が優先
  "endDate": "2025-01-31"     // 任意、CLI指定が優先
}
```

使い方
------

ビルド:

```
yarn install
yarn build
```

実行:

```
node dist/cli.js \
  --start-date 2024-01-01 \
  --end-date 2024-01-31 \
  --user-id U1234567890 \
  --format markdown \
  --output slack-activity-{date}.md
```

主なオプション:

- `--start-date`, `--end-date`: 省略時は `config.json`（あれば）→なければ「終了日から `defaultDays` 日前 / 現在時刻」の順で補完
- `--user-id`: 省略時は `.env` の `TARGET_USER_ID` またはトークン所有者
- `--format`: `json` または `markdown`（config.jsonの `outputFormat` が既定）
- `--output`: ファイル名テンプレート（`{date}` 置換対応）
- `--config`: 別の `config.json` を指定
  
出力先:
- 既定で `outputs/` ディレクトリ配下に保存されます。`config.json` の `outputDir` で変更可能。

注意事項
--------

- Slack APIのレート制限に配慮し、429応答時は待機します。
- 初回実行時はチャンネル一覧の取得が走るため時間がかかる場合があります。
- 実行には `channels:history`, `channels:read`, `groups:read`, `users:read` 等の権限を持つトークンが必要です。
