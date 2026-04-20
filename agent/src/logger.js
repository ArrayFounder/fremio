'use strict';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = {
  debug: '\x1b[36m', // cyan
  info:  '\x1b[32m', // green
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

const levelNum = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function log(level, msg, meta) {
  if (LEVELS[level] < levelNum) return;

  const ts  = new Date().toISOString();
  const col = COLORS[level] ?? '';
  const tag = `[${level.toUpperCase()}]`.padEnd(7);
  const out = level === 'error' ? process.stderr : process.stdout;

  out.write(`${ts} ${col}${tag}${RESET} ${msg}\n`);

  if (meta !== undefined) {
    const detail = typeof meta === 'string' ? meta : JSON.stringify(meta, null, 2);
    out.write(`${detail}\n`);
  }
}

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
