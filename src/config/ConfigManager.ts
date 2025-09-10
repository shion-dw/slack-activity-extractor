import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { AppConfig, SlackConfig } from '../types.js';
import { AppError } from '../errors.js';

const DEFAULT_CONFIG: AppConfig = {
  includeChannels: [],
  excludeChannels: [],
  contextMessageCount: 3,
  defaultDays: 30,
  outputFormat: 'json',
  outputFileName: undefined,
  outputDir: 'outputs',
};

export class ConfigManager {
  constructor(private configPath: string | undefined = undefined) {}

  loadSlackConfig(): SlackConfig {
    dotenv.config();
    const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
    if (!token) {
      throw new AppError(
        'Slackトークンが見つかりません。環境変数 SLACK_BOT_TOKEN または SLACK_USER_TOKEN を設定してください。',
        'CONFIG_MISSING_TOKEN',
        400
      );
    }
    const userId = process.env.TARGET_USER_ID;
    return { token, userId };
  }

  loadConfig(): AppConfig {
    const targetPath = this.configPath || path.resolve(process.cwd(), 'config.json');
    if (this.configPath && !fs.existsSync(targetPath)) {
      throw new AppError(`指定の設定ファイルが見つかりません: ${targetPath}`,'CONFIG_FILE_NOT_FOUND', 400);
    }

    if (!this.configPath && !fs.existsSync(targetPath)) {
      // Use defaults if no config.json
      return { ...DEFAULT_CONFIG };
    }

    try {
      const txt = fs.readFileSync(targetPath, 'utf-8');
      const json = JSON.parse(txt);
      const merged: AppConfig = { ...DEFAULT_CONFIG, ...json };
      this.validateConfig(merged);
      return merged;
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      throw new AppError(`設定ファイルの読み込みに失敗しました: ${e.message}`,'CONFIG_PARSE_ERROR', 400);
    }
  }

  validateConfig(config: AppConfig): boolean {
    if (config.contextMessageCount < 0 || !Number.isFinite(config.contextMessageCount)) {
      throw new AppError('contextMessageCount は0以上の数値である必要があります','CONFIG_INVALID', 400);
    }
    if (config.defaultDays <= 0 || !Number.isFinite(config.defaultDays)) {
      throw new AppError('defaultDays は1以上の数値である必要があります','CONFIG_INVALID', 400);
    }
    if (config.outputFormat !== 'json' && config.outputFormat !== 'markdown') {
      throw new AppError('outputFormat は "json" または "markdown" を指定してください','CONFIG_INVALID', 400);
    }
    if (config.includeChannels && !Array.isArray(config.includeChannels)) {
      throw new AppError('includeChannels は配列である必要があります','CONFIG_INVALID', 400);
    }
    if (config.excludeChannels && !Array.isArray(config.excludeChannels)) {
      throw new AppError('excludeChannels は配列である必要があります','CONFIG_INVALID', 400);
    }
    if (config.outputDir && typeof config.outputDir !== 'string') {
      throw new AppError('outputDir は文字列である必要があります','CONFIG_INVALID', 400);
    }
    return true;
  }
}
