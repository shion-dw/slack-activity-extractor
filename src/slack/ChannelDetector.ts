import { SlackClient } from './SlackClient.js';
import { logger } from '../utils/logger.js';

export class ChannelDetector {
  constructor(private client: SlackClient) {}

  async detectActiveChannels(
    userId: string,
    startDate: Date,
    endDate: Date,
    excludeChannels: string[] = []
  ): Promise<string[]> {
    const { valid: excludeIds } = await this.client.resolveChannelIds(excludeChannels);
    const channels = await this.client.getChannels();
    logger.info('アクティブチャンネル検出を開始:', '対象候補', channels.length, '件');
    const oldest = (startDate.getTime() / 1000).toFixed(6);
    const latest = (endDate.getTime() / 1000).toFixed(6);
    const active: string[] = [];

    for (const ch of channels) {
      if (excludeIds.includes(ch.id)) continue;
      try {
        const userMsgs = await this.client.findUserMessages(ch.id, userId, oldest, latest);
        if (userMsgs.length > 0) {
          active.push(ch.id);
        }
      } catch (e) {
        logger.warn('チャンネル検出でエラー。スキップ:', ch.id);
      }
    }
    logger.info('アクティブチャンネル検出の完了:', '該当', active.length, '件');
    return active;
  }

  async resolveChannelIds(channels: string[]): Promise<string[]> {
    const { valid, invalid } = await this.client.resolveChannelIds(channels);
    if (invalid.length > 0) {
      logger.warn('無効なチャンネル指定を無視します:', invalid.join(', '));
    }
    return valid;
  }
}
