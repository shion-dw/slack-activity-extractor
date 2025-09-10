import { ChannelInfo, ExtractionResult, MessageWithContext, SlackMessage } from '../types.js';
import { SlackClient } from '../slack/SlackClient.js';
import { logger } from '../utils/logger.js';

export class MessageProcessor {
  constructor(private client: SlackClient) {}

  async extractUserMessagesWithContext(
    channels: ChannelInfo[] | string[],
    userId: string,
    startDate: Date,
    endDate: Date,
    contextCount: number
  ): Promise<ExtractionResult> {
    const isChannelObjects = Array.isArray(channels) && (channels as any[])[0] && typeof (channels as any[])[0] !== 'string';
    const channelIds: string[] = isChannelObjects
      ? (channels as ChannelInfo[]).map((c) => c.id)
      : (channels as string[]);
    const nameMap = new Map<string, string>();
    if (isChannelObjects) {
      for (const c of channels as ChannelInfo[]) nameMap.set(c.id, c.name);
    }

    const oldest = (startDate.getTime() / 1000).toFixed(6);
    const latest = (endDate.getTime() / 1000).toFixed(6);
    const messagesWithContext: MessageWithContext[] = [];
    const channelsProcessed: string[] = [];

    logger.info('メッセージ抽出を開始:', '対象チャンネル', channelIds.length, '件');
    for (let i = 0; i < channelIds.length; i++) {
      const channelId = channelIds[i];
      const label = nameMap.get(channelId) || this.client.getCachedChannelName(channelId) || channelId;
      logger.info(`(${i + 1}/${channelIds.length}) 処理中: #${label}`);
      // チャンネル履歴 + 該当期間内のスレッド返信を取り込み
      const base = await this.client.getChannelHistory(channelId, oldest, latest);
      const threadRoots = new Set<string>();
      for (const m of base) {
        if (m.thread_ts) threadRoots.add(m.thread_ts);
        if (!m.thread_ts && (m as any).reply_count) threadRoots.add(m.ts);
        if (m.thread_ts === m.ts) threadRoots.add(m.ts);
      }
      logger.info('スレッド候補:', threadRoots.size, '件');
      const replies: SlackMessage[] = [];
      for (const ts of threadRoots) {
        const rep = await this.client.getThreadReplies(channelId, ts, oldest, latest);
        replies.push(...rep);
      }
      const map = new Map<string, SlackMessage>();
      for (const m of [...base, ...replies]) map.set(m.ts, m);
      const allMessages = Array.from(map.values()).sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

      const channelUserMessages = allMessages.filter((m) => m.user === userId && !m.subtype);
      logger.info('集計:', '履歴', base.length, 'スレッド', replies.length, '合計', allMessages.length, '対象', channelUserMessages.length);
      if (channelUserMessages.length === 0) continue;

      const channelName = this.client.getCachedChannelName(channelId) || channelId;
      channelsProcessed.push(channelName);

      for (const um of channelUserMessages) {
        let context: SlackMessage[] = [];
        // スレッド内のメッセージなら、同一 thread_ts のみから前後N件を抽出
        if (um.thread_ts) {
          const rootTs = um.thread_ts;
          const threadMsgs = allMessages
            .filter((m) => m.thread_ts === rootTs || m.ts === rootTs)
            .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
          const idx = threadMsgs.findIndex((m) => m.ts === um.ts);
          const startIdx = Math.max(0, idx - contextCount);
          const endIdx = Math.min(threadMsgs.length, idx + contextCount + 1);
          context = threadMsgs.slice(startIdx, endIdx).filter((m) => m.ts !== um.ts);
        } else {
          // スレッド外はチャンネルタイムラインから前後N件
          const idx = allMessages.findIndex((m) => m.ts === um.ts);
          const startIdx = Math.max(0, idx - contextCount);
          const endIdx = Math.min(allMessages.length, idx + contextCount + 1);
          context = allMessages.slice(startIdx, endIdx).filter((m) => m.ts !== um.ts);
        }
        messagesWithContext.push({
          userMessage: um,
          contextMessages: context,
          channelName,
        });
      }
    }

    logger.info('ユーザー名解決を実施中…');
    // Resolve user display names for readability
    const userIds = new Set<string>();
    for (const item of messagesWithContext) {
      if (item.userMessage.user) userIds.add(item.userMessage.user);
      for (const ctx of item.contextMessages) if (ctx.user) userIds.add(ctx.user);
    }
    if (userId) userIds.add(userId);

    const users: Record<string, string> = {};
    for (const id of Array.from(userIds)) {
      try {
        const info = await this.client.getUserInfo(id);
        const profile = (info as any)?.profile || {};
        const name =
          profile.display_name_normalized ||
          profile.display_name ||
          profile.real_name_normalized ||
          profile.real_name ||
          (info as any)?.name ||
          id;
        users[id] = String(name);
      } catch (_) {
        users[id] = id;
      }
    }

    const result: ExtractionResult = {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      targetUser: userId,
      messagesWithContext,
      summary: {
        totalUserMessages: messagesWithContext.length,
        totalChannels: channelsProcessed.length,
        channelsProcessed,
      },
      users,
      contextCount: contextCount,
    };
    logger.info('メッセージ抽出の完了:', 'メッセージ', result.summary.totalUserMessages, '件', 'チャンネル', result.summary.totalChannels, '件');
    return result;
  }
}
