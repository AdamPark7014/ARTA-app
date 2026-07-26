import { ConsoleLogger, LogLevel } from '@nestjs/common';

type LogFields = Record<string, unknown>;

/**
 * JSON structured logger for container / log aggregators.
 * Set LOG_FORMAT=json (default in production) or LOG_FORMAT=pretty.
 */
export class JsonLogger extends ConsoleLogger {
  private readonly jsonMode: boolean;

  constructor(context?: string) {
    super(context || 'ARTA');
    const fmt = (process.env.LOG_FORMAT || '').toLowerCase();
    this.jsonMode =
      fmt === 'json' || (!fmt && process.env.NODE_ENV === 'production');
  }

  private emit(level: string, message: unknown, context?: string, extra?: LogFields) {
    if (!this.jsonMode) {
      return;
    }
    const line = {
      ts: new Date().toISOString(),
      level,
      service: 'arta-api',
      context: context || this.context,
      msg: typeof message === 'string' ? message : JSON.stringify(message),
      ...extra,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(line));
  }

  log(message: unknown, context?: string) {
    if (this.jsonMode) this.emit('info', message, context);
    else super.log(message as string, context);
  }

  error(message: unknown, stackOrContext?: string, context?: string) {
    if (this.jsonMode) {
      const stack = context !== undefined ? stackOrContext : undefined;
      const ctx = context !== undefined ? context : stackOrContext;
      this.emit('error', message, ctx, stack ? { stack } : undefined);
    } else {
      super.error(message as string, stackOrContext, context);
    }
  }

  warn(message: unknown, context?: string) {
    if (this.jsonMode) this.emit('warn', message, context);
    else super.warn(message as string, context);
  }

  debug(message: unknown, context?: string) {
    if (this.jsonMode) this.emit('debug', message, context);
    else super.debug?.(message as string, context);
  }

  verbose(message: unknown, context?: string) {
    if (this.jsonMode) this.emit('verbose', message, context);
    else super.verbose?.(message as string, context);
  }

  setLogLevels(levels: LogLevel[]) {
    super.setLogLevels?.(levels);
  }
}
