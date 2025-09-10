import { WebClient, LogLevel as SlackLogLevel } from '@slack/web-api';
import { ChannelInfo, SlackMessage } from '../types.js';
import { AppError } from '../errors.js';
import { logger } from '../utils/logger.js';

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export class SlackClient {
  private client: WebClient;
  private channelCache: Map<string, ChannelInfo> = new Map();

  constructor(token: string) {
    if (!token) {
      throw new AppError('Slackトークンが未設定です','SLACK_TOKEN_MISSING', 400);
    }
    this.client = new WebClient(token, { logLevel: SlackLogLevel.ERROR });
  }

  async getAuthUserId(): Promise<string | undefined> {
    try {
      const resp = await this.client.auth.test();
      return resp.user_id as string | undefined;
    } catch (e: any) {
      logger.warn('auth.test でユーザーID取得に失敗しました:', e?.data?.error || e?.message);
      return undefined;
    }
  }

  async getChannels(): Promise<ChannelInfo[]> {
    const result: ChannelInfo[] = [];
    logger.info('チャンネル一覧を取得しています…');
    let cursor: string | undefined = undefined;
    do {
      try {
        const resp = await this.client.conversations.list({ limit: 1000, cursor });
        const chans = (resp.channels || []).map((c: any) => ({
          id: c.id as string,
          name: c.name as string,
          is_member: c.is_member as boolean,
        }));
        chans.forEach((c) => this.channelCache.set(c.id, c));
        result.push(...chans);
        cursor = (resp.response_metadata as any)?.next_cursor || undefined;
        logger.debug('取得ページのチャンネル数:', chans.length, '累計:', result.length);
      } catch (e: any) {
        await this.handleSlackError(e, 'チャンネル一覧の取得に失敗しました');
      }
    } while (cursor);
    logger.info('チャンネル一覧の取得完了:', result.length, '件');
    return result;
  }

  private toUnixTs(dateOrTs: string | number | Date): string {
    if (typeof dateOrTs === 'string') return dateOrTs;
    if (dateOrTs instanceof Date) return (dateOrTs.getTime() / 1000).toFixed(6);
    return (dateOrTs / 1000).toFixed(6);
  }

  async getChannelInfo(channelId: string): Promise<ChannelInfo> {
    // 既にキャッシュがあればそれを返す
    const cached = this.channelCache.get(channelId);
    if (cached) return cached;
    try {
      const resp = await this.client.conversations.info({ channel: channelId });
      const c: any = (resp as any).channel;
      const info: ChannelInfo = { id: c.id, name: c.name, is_member: c.is_member };
      this.channelCache.set(info.id, info);
      return info;
    } catch (e: any) {
      await this.handleSlackError(e, `チャンネル情報の取得に失敗しました (${channelId})`);
      throw e; // never到達（型エラー回避）
    }
  }

  async getChannelHistory(channelId: string, oldest: string, latest: string): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined = undefined;
    do {
      try {
        const resp = await this.client.conversations.history({
          channel: channelId,
          limit: 200,
          cursor,
          oldest,
          latest,
          inclusive: true,
        });
        const list = (resp.messages || []).map((m: any) => ({
          ts: m.ts as string,
          user: m.user as string | undefined,
          text: m.text as string | undefined,
          channel: channelId,
          thread_ts: m.thread_ts as string | undefined,
          subtype: m.subtype as string | undefined,
        }));
        messages.push(...list);
        cursor = (resp.response_metadata as any)?.next_cursor || undefined;
      } catch (e: any) {
        await this.handleSlackError(e, `チャンネル ${channelId} の履歴取得に失敗しました`);
      }
    } while (cursor);
    // 時系列昇順に
    messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
    return messages;
  }

  async getThreadReplies(channelId: string, threadTs: string, oldest: string, latest: string): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined = undefined;
    do {
      try {
        const resp = await this.client.conversations.replies({
          channel: channelId,
          ts: threadTs,
          cursor,
          inclusive: true,
          oldest,
          latest,
          limit: 200,
        });
        const list = (resp.messages || []).map((m: any) => ({
          ts: m.ts as string,
          user: m.user as string | undefined,
          text: m.text as string | undefined,
          channel: channelId,
          thread_ts: (m.thread_ts as string | undefined) || (m.reply_count ? (m.ts as string) : undefined),
          subtype: m.subtype as string | undefined,
        }));
        messages.push(...list);
        cursor = (resp.response_metadata as any)?.next_cursor || undefined;
      } catch (e: any) {
        await this.handleSlackError(e, `スレッド返信の取得に失敗しました (${channelId}/${threadTs})`);
      }
    } while (cursor);
    messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
    return messages;
  }

  async findUserMessages(channelId: string, userId: string, oldest: string, latest: string): Promise<SlackMessage[]> {
    const base = await this.getChannelHistory(channelId, oldest, latest);
    // 既知のスレッドを抽出（root も reply も thread_ts を持つ）
    const threadRoots = new Set<string>();
    for (const m of base) {
      if (m.thread_ts) threadRoots.add(m.thread_ts);
      // 一部 root は thread_ts を自身の ts として持つ
      if (!m.thread_ts && (m as any).reply_count) threadRoots.add(m.ts);
      if (m.thread_ts === m.ts) threadRoots.add(m.ts);
    }
    const replies: SlackMessage[] = [];
    for (const ts of threadRoots) {
      const rep = await this.getThreadReplies(channelId, ts, oldest, latest);
      replies.push(...rep);
    }
    // マージして重複排除（ts で一意）
    const byTs = new Map<string, SlackMessage>();
    for (const m of [...base, ...replies]) byTs.set(m.ts, m);
    const all = Array.from(byTs.values());
    return all.filter((m) => m.user === userId && !m.subtype);
  }

  async getUserInfo(userId: string): Promise<any> {
    try {
      const resp = await this.client.users.info({ user: userId });
      return resp.user;
    } catch (e: any) {
      await this.handleSlackError(e, 'ユーザー情報の取得に失敗しました');
      return undefined as any;
    }
  }

  getCachedChannelName(id: string): string | undefined {
    return this.channelCache.get(id)?.name;
  }

  async resolveChannelIds(inputs: string[]): Promise<{ valid: string[]; invalid: string[] }> {
    const channels = await this.getChannels();
    const byName = new Map(channels.map((c) => [c.name, c.id] as const));
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const v of inputs) {
      if (v.startsWith('C') || v.startsWith('G')) {
        if (channels.find((c) => c.id === v)) valid.push(v); else invalid.push(v);
      } else {
        const id = byName.get(v);
        if (id) valid.push(id); else invalid.push(v);
      }
    }
    return { valid, invalid };
  }

  private async handleSlackError(e: any, prefix: string): Promise<never> {
    // Rate limit
    if (e?.data?.error === 'ratelimited' || e?.status === 429) {
      const retryAfter = parseInt(e?.headers?.['retry-after'] || '1', 10) * 1000;
      logger.warn('Slack API レート制限。待機します:', retryAfter, 'ms');
      await sleep(retryAfter);
      throw e; // 上位でリトライ戦略をとる場合に備えて
    }
    const msg = `${prefix}: ${e?.data?.error || e?.message || e}`;
    throw new AppError(msg, 'SLACK_API_ERROR', 500);
  }
}
