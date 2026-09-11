import pino from 'pino';
import env from '../config/env.js';

const isProduction = env.NODE_ENV === 'production';

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

/**
 * Cria um logger filho com contexto injetado para rastreabilidade de requisições.
 * @param {Record<string, unknown>} bindings
 * @returns {pino.Logger}
 */
export function createChildLogger(bindings) {
  return logger.child(bindings);
}

export default logger;
