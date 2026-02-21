
const LOG_LEVELS = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
};

const currentLevel = import.meta.env.MODE === 'development' ? LOG_LEVELS.DEBUG : LOG_LEVELS.ERROR;

export const logger = {
  error: (...args) => {
    if (currentLevel >= LOG_LEVELS.ERROR) console.error(...args);
  },
  warn: (...args) => {
    if (currentLevel >= LOG_LEVELS.WARN) console.warn(...args);
  },
  info: (...args) => {
    if (currentLevel >= LOG_LEVELS.INFO) console.info(...args);
  },
  debug: (...args) => {
    if (currentLevel >= LOG_LEVELS.DEBUG) console.log(...args);
  },
};
