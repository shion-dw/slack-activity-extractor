import fs from 'node:fs/promises';
import path from 'node:path';
import { format as formatDate } from 'date-fns';
import { ExtractionResult, OutputOptions } from '../types.js';

export class OutputGenerator {
  async generateOutput(result: ExtractionResult, options: OutputOptions): Promise<string> {
    if (options.format === 'json') {
      return JSON.stringify(result, null, 2);
    }
    return await this.toMarkdown(result);
  }

  async saveToFile(content: string, fileName: string, outDir?: string): Promise<void> {
    const dir = outDir && outDir.trim().length > 0 ? outDir : 'outputs';
    await fs.mkdir(dir, { recursive: true });
    const fullPath = path.join(dir, fileName);
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  buildFileName(pattern: string | undefined, format: 'json' | 'markdown'): string {
    const date = formatDate(new Date(), 'yyyyMMdd-HHmmss');
    let fileName = pattern || `slack-activity-${date}.${format === 'json' ? 'json' : 'md'}`;
    if (pattern) {
      fileName = pattern.replace('{date}', date);
      if (!/\.md$|\.json$/i.test(fileName)) {
        fileName += format === 'json' ? '.json' : '.md';
      }
    }
    return fileName;
  }

  private async toMarkdown(result: ExtractionResult): Promise<string> {
    const toISO = (ts: string | undefined) =>
      ts ? new Date(parseFloat(ts) * 1000).toISOString() : 'unknown';
    const userName = (id?: string) => {
      if (!id) return 'unknown';
      const name = result.users?.[id];
      return name ? `@${name}` : id;
    };
    const showText = (text?: string, subtype?: string) => {
      const trimmed = (text || '').trim();
      if (trimmed) return trimmed;
      return subtype ? `(本文なし / ${subtype})` : '(本文なし)';
    };
    const ctxN = result.contextCount ?? 0;

    const lines: string[] = [];
    lines.push(`# Slack ユーザー発言レポート`);
    lines.push('');
    lines.push('このファイルは Slack の特定ユーザー発言とその前後の文脈を抽出したレポートです。');
    lines.push('');
    lines.push(`- 期間: ${result.period.start} 〜 ${result.period.end}`);
    lines.push(`- 対象ユーザー: ${userName(result.targetUser)} (${result.targetUser})`);
    lines.push(`- 文脈件数: 前後 各 ${ctxN} 件`);
    lines.push(`- メッセージ数: ${result.summary.totalUserMessages}`);
    lines.push(`- チャンネル数: ${result.summary.totalChannels}`);
    lines.push('');
    lines.push(`注記: 時刻は ISO 8601 (UTC)。対象行は "<= TARGET" で示します。`);
    lines.push('');
    for (const item of result.messagesWithContext) {
      const target = item.userMessage;
      const targetTs = parseFloat(target.ts);
      const ctxSorted = [...item.contextMessages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
      const pre = ctxSorted.filter((m) => parseFloat(m.ts) < targetTs);
      const post = ctxSorted.filter((m) => parseFloat(m.ts) > targetTs);

      lines.push(`## #${item.channelName} - ${toISO(item.userMessage.ts)}`);
      lines.push('');
      lines.push('```');
      for (const m of pre) {
        lines.push(`[${toISO(m.ts)}] ${userName(m.user)}: ${showText(m.text, m.subtype)}`);
      }
      lines.push(`[${toISO(target.ts)}] ${userName(target.user)}: ${showText(target.text, target.subtype)}  <= TARGET`);
      for (const m of post) {
        lines.push(`[${toISO(m.ts)}] ${userName(m.user)}: ${showText(m.text, m.subtype)}`);
      }
      lines.push('```');
      lines.push('');
    }
    return lines.join('\n');
  }
}
