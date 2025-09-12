#!/usr/bin/env node
import { Command } from 'commander';
import { ConfigManager } from './config/ConfigManager.js';
import { SlackClient } from './slack/SlackClient.js';
import { ChannelDetector } from './slack/ChannelDetector.js';
import { MessageProcessor } from './processing/MessageProcessor.js';
import { OutputGenerator } from './output/OutputGenerator.js';
import { ErrorHandler, AppError } from './errors.js';
import { logger, setLogLevel } from './utils/logger.js';
import { addDays, parseISO, isValid } from 'date-fns';

function parseDateInput(input?: string): Date | undefined {
  if (!input) return undefined;
  const d = parseISO(input);
  return isValid(d) ? d : undefined;
}

async function main() {
  const program = new Command();
  program
    .name('slack-activity-extractor')
    .description('Slack上の特定ユーザー発言と文脈を抽出し、JSON/Markdownで出力')
    .option('-s, --start-date <date>', '開始日 (YYYY-MM-DD)')
    .option('-e, --end-date <date>', '終了日 (YYYY-MM-DD)')
    .option('-u, --user-id <userId>', '対象ユーザーID (省略時はトークン所有者)')
    .option('-f, --format <format>', '出力形式: json | markdown')
    .option('-o, --output <file>', '出力ファイル名 (テンプレート: {datetime} / 互換: {date})')
    .option('-c, --config <path>', '設定ファイルパス (config.json)')
    .option('--log-level <level>', 'ログレベル: debug|info|warn|error', 'info')
    .showHelpAfterError();

  program.parse(process.argv);
  const opts = program.opts<{
    startDate?: string;
    endDate?: string;
    userId?: string;
    format?: 'json' | 'markdown';
    output?: string;
    config?: string;
    logLevel?: string;
  }>();

  setLogLevel((opts.logLevel as any) || 'info');

  try {
    // Load configs
    const cfg = new ConfigManager(opts.config);
    const slackCfg = cfg.loadSlackConfig();
    const appCfg = cfg.loadConfig();
    logger.info('設定を読み込みました');

    // Dates
    const now = new Date();
    const cfgStart = parseDateInput(appCfg.startDate);
    const cfgEnd = parseDateInput(appCfg.endDate);
    const end = parseDateInput(opts.endDate) || cfgEnd || now;
    const start =
      parseDateInput(opts.startDate) ||
      cfgStart ||
      addDays(end, -appCfg.defaultDays);
    if (!start || !end) {
      throw new AppError('日付形式が不正です。YYYY-MM-DD を指定してください。', 'INVALID_DATE', 400);
    }
    if (start > end) {
      throw new AppError('開始日は終了日以前である必要があります', 'INVALID_DATE_RANGE', 400);
    }
    logger.info('抽出期間:', start.toISOString(), '〜', end.toISOString());

    const format = (opts.format || appCfg.outputFormat) as 'json' | 'markdown';
    const outFileTmpl = opts.output || appCfg.outputFileName;

    // Slack client
    const client = new SlackClient(slackCfg.token);
    const me = slackCfg.userId || (await client.getAuthUserId());
    const targetUserId = opts.userId || me;
    if (!targetUserId) {
      throw new AppError('対象ユーザーIDが特定できませんでした', 'MISSING_USER', 400);
    }
    logger.info('対象ユーザー:', targetUserId);

    // Channels
    const detector = new ChannelDetector(client);
    let channelIds: string[] = [];
    if (appCfg.includeChannels && appCfg.includeChannels.length > 0) {
      const idsLike = appCfg.includeChannels.filter((v) => /^C|^G/.test(v));
      const namesLike = appCfg.includeChannels.filter((v) => !/^C|^G/.test(v));
      const resolvedFromNames = namesLike.length > 0 ? await detector.resolveChannelIds(namesLike) : [];
      channelIds = [...idsLike, ...resolvedFromNames];
    } else {
      channelIds = await detector.detectActiveChannels(
        targetUserId,
        start,
        end,
        appCfg.excludeChannels || []
      );
    }
    if (appCfg.excludeChannels && appCfg.excludeChannels.length > 0) {
      const excludeIds = await detector.resolveChannelIds(appCfg.excludeChannels);
      channelIds = channelIds.filter((id) => !excludeIds.includes(id));
    }
    if (channelIds.length === 0) {
      logger.warn('対象チャンネルが見つかりませんでした。設定を確認してください。');
    }
    logger.info('対象チャンネル数:', channelIds.length);

    // Build ChannelInfo list for reporting channel names without全件取得
    const channelInfos = [] as { id: string; name: string; is_member?: boolean }[];
    for (const id of channelIds) {
      try {
        const info = await client.getChannelInfo(id);
        channelInfos.push(info);
      } catch (_) {
        channelInfos.push({ id, name: id });
      }
    }
    logger.debug('対象チャンネル名:', channelInfos.map((c) => `#${c.name}`).join(', '));

    // Process
    const processor = new MessageProcessor(client);
    logger.info('メッセージ抽出を実行します…');
    const result = await processor.extractUserMessagesWithContext(
      channelInfos,
      targetUserId,
      start,
      end,
      appCfg.contextMessageCount
    );

    // Output
    const output = new OutputGenerator();
    const fileName = output.buildFileName(outFileTmpl, format);
    logger.info('出力を生成します…', '形式:', format, 'ファイル:', fileName, 'ディレクトリ:', appCfg.outputDir || 'outputs');
    const content = await output.generateOutput(result, { format, fileName, outDir: appCfg.outputDir });
    await output.saveToFile(content, fileName, appCfg.outputDir);

    logger.info('出力完了:', fileName);
  } catch (e) {
    ErrorHandler.handle(e as Error);
  }
}

main();
