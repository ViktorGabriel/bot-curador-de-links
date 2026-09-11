import logger from '../utils/logger.js';

export default {
  name: 'clientReady',
  once: true,
  execute(c) {
    logger.info({ botTag: c.user.tag, botId: c.user.id }, 'Bot conectado e pronto no Discord Gateway.');
  },
};
