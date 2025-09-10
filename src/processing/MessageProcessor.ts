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
    const channelIds: string[] = Array.isArray(channels) && (channels as any[])[0] && typeof (channels as any[])[0] === 'string'
      ? (channels as string[])
      : (channels as ChannelInfo[]).map((c) => c.id);

    const oldest = (startDate.getTime() / 1000).toFixed(6);
    const latest = (endDate.getTime() / 1000).toFixed(6);
    const messagesWithContext: MessageWithContext[] = [];
    const channelsProcessed: string[] = [];

    logger.info('メッセージ抽出を開始:', '対象チャンネル', channelIds.length, '件');
    for (const channelId of channelIds) {
      const allMessages = await this.client.getChannelHistory(channelId, oldest, latest);
      const channelUserMessages = allMessages.filter((m) => m.user === userId && !m.subtype);
      logger.debug('チャンネル処理:', channelId, '総メッセージ', allMessages.length, '対象ユーザー', channelUserMessages.length);
      if (channelUserMessages.length === 0) continue;

      const channelName = this.client.getCachedChannelName(channelId) || channelId;
      channelsProcessed.push(channelName);

      for (const um of channelUserMessages) {
        const idx = allMessages.findIndex((m) => m.ts === um.ts);
        const startIdx = Math.max(0, idx - contextCount);
        const endIdx = Math.min(allMessages.length, idx + contextCount + 1);
        const context: SlackMessage[] = allMessages
          .slice(startIdx, endIdx)
          .filter((m) => m.ts !== um.ts);
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
