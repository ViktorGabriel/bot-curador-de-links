import env from '../config/env.js';
import logger, { createChildLogger } from '../utils/logger.js';
import { curatorService } from '../services/curatorService.js';
import { EMOJI_TO_CATEGORY } from '../utils/categoryHelper.js';

export default {
  name: 'messageReactionAdd',
  once: false,
  async execute(reaction, user, client) {
    // 1. Ignora reações de bots
    if (user.bot) return;

    // 2. Resolução de partials
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (err) {
        logger.error({ err: err.message }, 'Falha ao buscar partial da reação do Discord.');
        return;
      }
    }

    const { message } = reaction;

    if (message.partial) {
      try {
        await message.fetch();
      } catch (err) {
        logger.error({ err: err.message }, 'Falha ao buscar partial da mensagem do Discord.');
        return;
      }
    }

    // 3. Validação do emoji gatilho (geral ou temático)
    const emojiName = reaction.emoji.name;
    const isTriggerEmoji = emojiName === env.TRIGGER_EMOJI;
    const isCategoryEmoji = Boolean(EMOJI_TO_CATEGORY[emojiName]);

    if (!isTriggerEmoji && !isCategoryEmoji) return;

    // 4. Validação do canal de destino
    const targetChannel = client.channels.cache.get(env.TARGET_CHANNEL_ID);
    if (!targetChannel || !targetChannel.isTextBased()) {
      createChildLogger({ targetChannelId: env.TARGET_CHANNEL_ID }).error(
        'Canal de destino inválido ou inacessível no cliente Discord.'
      );
      return;
    }

    // 5. Delegação completa para a camada de aplicação/serviço com o emoji correspondente
    await curatorService.curateMessage({
      message,
      curator: user,
      targetChannel,
      emoji: emojiName,
    });
  },
};
