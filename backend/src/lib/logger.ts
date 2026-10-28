const writers = { info: console.info, warn: console.warn, error: console.error };
type Level = keyof typeof writers;

/** Minimal structured logger. Never pass request bodies or other client data to it. */
function log(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test' && level !== 'error') {
    return;
  }
  const entry = JSON.stringify({ level, time: new Date().toISOString(), message, ...meta });
  writers[level](entry);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
};
