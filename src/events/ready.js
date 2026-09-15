import logger from '../utils/logger.js';
import { registerCommands } from '../handlers/commandHandler.js';

export default {
  name: 'clientReady',
  once: true,
  async execute(c) {
    logger.info({ botTag: c.user.tag, botId: c.user.id }, 'Bot conectado e pronto no Discord Gateway.');
    if (c.commands && c.commands.size > 0) {
      await registerCommands(c);
    }
  },
};
