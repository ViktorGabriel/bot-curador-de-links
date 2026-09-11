import env from '../config/env.js';
import logger, { createChildLogger } from '../utils/logger.js';
import {
  claimMessageForCuration,
  markMessageCompleted,
  markMessageFailed,
} from '../services/database.js';
import { extractLinkMetadata } from '../services/metadataScraper.js';
import { buildCuratedEmbed } from '../utils/embedBuilder.js';
import { extractSafeUrls } from '../utils/urlValidator.js';

export default {
  name: 'messageReactionAdd',
  once: false,
  async execute(reaction, user, client) {
    // Ignora reações de bots
    if (user.bot) return;

    // Resolução de partials
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

    // Verifica se o emoji corresponde ao configurado
    if (reaction.emoji.name !== env.TRIGGER_EMOJI) return;

    // Contexto estruturado para rastreamento
    const reqLogger = createChildLogger({
      messageId: message.id,
      curatorId: user.id,
      channelId: message.channelId,
    });

    // Extrai URLs do texto validando contra SSRF
    const safeUrls = await extractSafeUrls(message.content);
    if (safeUrls.length === 0) {
      reqLogger.debug('Reação acionada, mas nenhuma URL pública válida foi encontrada no conteúdo.');
      return;
    }

    const targetChannel = client.channels.cache.get(env.TARGET_CHANNEL_ID);
    if (!targetChannel || !targetChannel.isTextBased()) {
      reqLogger.error({ targetChannelId: env.TARGET_CHANNEL_ID }, 'Canal de destino inválido ou inacessível.');
      return;
    }

    // Reserva atômica: previne condição de corrida (Race Condition) entre reações concorrentes
    const claimed = claimMessageForCuration({
      messageId: message.id,
      curatorId: user.id,
      channelId: targetChannel.id,
      createdAt: message.createdAt,
    });

    if (!claimed) {
      reqLogger.debug('Mensagem já curada ou em processamento por outra execução.');
      return;
    }

    reqLogger.info({ urlCount: safeUrls.length }, 'Iniciando curadoria de links da mensagem...');

    try {
      // Extração leve de metadados do primeiro link com timeout de 3 segundos
      const metadata = await extractLinkMetadata(safeUrls[0]);

      // Constrói o embed através do utilitário desacoplado
      const embed = buildCuratedEmbed({
        message,
        curator: user,
        urls: safeUrls,
        metadata,
      });

      // Envia para o canal de destino com proteção explícita contra menções em massa (@everyone / @here)
      await targetChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      // Finaliza a curadoria com transação atômica
      markMessageCompleted({
        messageId: message.id,
        urls: safeUrls,
      });

      reqLogger.info('Curadoria realizada e publicada no canal de destino com sucesso.');
    } catch (err) {
      reqLogger.error({ err }, 'Falha durante o processamento da curadoria.');
      markMessageFailed(message.id);
    }
  },
};
