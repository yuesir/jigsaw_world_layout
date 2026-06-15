/**
 * Tiny leveled logger. Defaults to console.*; can be replaced via install().
 *
 *   log.debug('foo');  // console.debug
 *   log.warn('bar');   // console.warn
 *   log.fault('baz');  // console.error with tag
 */
type ConsoleLike = {
  log: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

let sink: ConsoleLike = console;

export const log = {
  install(c: ConsoleLike): void {
    sink = c;
  },
  debug(...args: unknown[]): void {
    sink.debug(...args);
  },
  log(...args: unknown[]): void {
    sink.log(...args);
  },
  info(...args: unknown[]): void {
    sink.info(...args);
  },
  warn(...args: unknown[]): void {
    sink.warn(...args);
  },
  error(...args: unknown[]): void {
    sink.error(...args);
  },
  fault(...args: unknown[]): void {
    sink.error('[FAULT]', ...args);
  },
};
