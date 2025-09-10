/* Simple console-based logger with levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function shouldLog(level: LogLevel) {
  return levelOrder[level] >= levelOrder[currentLevel];
}

export const logger = {
  debug: (...args: unknown[]) => shouldLog('debug') && console.debug('[debug]', ...args),
  info: (...args: unknown[]) => shouldLog('info') && console.info('[info]', ...args),
  warn: (...args: unknown[]) => shouldLog('warn') && console.warn('[warn]', ...args),
  error: (...args: unknown[]) => shouldLog('error') && console.error('[error]', ...args),
};

