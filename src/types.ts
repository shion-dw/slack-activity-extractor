export interface AppConfig {
  includeChannels?: string[];
  excludeChannels?: string[];
  contextMessageCount: number;
  defaultDays: number;
  outputFormat: "json" | "markdown";
  outputFileName?: string;
  outputDir?: string; // 保存先ディレクトリ（既定: outputs）
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export interface SlackConfig {
  token: string;
  userId?: string;
}

export interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  channel: string;
  thread_ts?: string;
  subtype?: string;
}

export interface ChannelInfo {
  id: string;
  name: string;
  is_member?: boolean;
}

export interface MessageWithContext {
  userMessage: SlackMessage;
  contextMessages: SlackMessage[];
  channelName: string;
}

export interface ExtractionResult {
  period: {
    start: string;
    end: string;
  };
  targetUser: string;
  messagesWithContext: MessageWithContext[];
  summary: {
    totalUserMessages: number;
    totalChannels: number;
    channelsProcessed: string[];
  };
  users?: Record<string, string>; // userId -> display name
  contextCount?: number;
}

export interface OutputOptions {
  format: "json" | "markdown";
  fileName?: string;
  outDir?: string;
}

export interface CLIOptions {
  startDate?: string;
  endDate?: string;
  userId?: string;
  format?: "json" | "markdown";
  output?: string;
  config?: string;
}
