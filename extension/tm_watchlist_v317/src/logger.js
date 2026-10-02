export const LOG_LEVELS = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};

export class Logger {
  static level = LOG_LEVELS.INFO;
  static logBuffer = [];
  static MAX_BUFFER_SIZE = 100;

  static _append(lvl, args) {
    if (this.logBuffer.length >= this.MAX_BUFFER_SIZE) {
        this.logBuffer.shift(); // Remove oldest log
    }
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    this.logBuffer.push(`[${new Date().toISOString()}] [${lvl}] ${msg}`);
  }

  static getLogs() {
    return this.logBuffer.join('\\n');
  }

  static setLevel(levelName) {
    const lvl = LOG_LEVELS[levelName];
    if (lvl !== undefined) {
      this.level = lvl;
      this.info(`Logger level set to ${levelName}`);
    } else {
      console.warn(`[TM] Invalid log level: ${levelName}`);
    }
  }

  static error(...args) {
    this._append('ERROR', args);
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error('[TM]', ...args);
    }
  }

  static warn(...args) {
    this._append('WARN', args);
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn('[TM]', ...args);
    }
  }

  static info(...args) {
    this._append('INFO', args);
    if (this.level >= LOG_LEVELS.INFO) {
      console.log('[TM]', ...args);
    }
  }

  static debug(...args) {
    this._append('DEBUG', args);
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.debug('[TM]', ...args);
    }
  }
}
