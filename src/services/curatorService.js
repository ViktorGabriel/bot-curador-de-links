import {
  claimMessageForCuration as defaultClaim,
  markMessageCompleted as defaultComplete,
  markMessageFailed as defaultFail,
} from './database.js';
import { extractSafeUrls as defaultExtractSafeUrls } from '../utils/urlValidator.js';
import { extractLinkMetadata as defaultExtractMetadata } from './metadataScraper.js';
import { buildCuratedEmbed as defaultBuildEmbed } from '../utils/embedBuilder.js';
import { createChildLogger } from '../utils/logger.js';

export class CuratorService {
  /**
   * @param {Object} [dependencies]
   * @param {typeof defaultClaim} [dependencies.claimMessage]
   * @param {typeof defaultComplete} [dependencies.markCompleted]
   * @param {typeof defaultFail} [dependencies.markFailed]
   * @param {typeof defaultExtractSafeUrls} [dependencies.extractSafeUrls]
   * @param {typeof defaultExtractMetadata} [dependencies.extractMetadata]
   * @param {typeof defaultBuildEmbed} [dependencies.buildEmbed]
   */
  constructor(dependencies = {}) {
    this.claimMessage = dependencies.claimMessage || defaultClaim;
    this.markCompleted = dependencies.markCompleted || defaultComplete;
    this.markFailed = dependencies.markFailed || defaultFail;
    this.extractSafeUrls = dependencies.extractSafeUrls || defaultExtractSafeUrls;
    this.extractMetadata = dependencies.extractMetadata || defaultExtractMetadata;
    this.buildEmbed = dependencies.buildEmbed || defaultBuildEmbed;
  }

  /**
   * Executa o fluxo de negócio completo de curadoria de mensagem.
   *
   * @param {Object} params
   * @param {import('discord.js').Message} params.message
   * @param {import('discord.js').User} params.curator
   * @param {import('discord.js').TextBasedChannel} params.targetChannel
   * @returns {Promise<{ success: boolean, status: string, urls?: string[], error?: string }>}
   */
  async curateMessage({ message, curator, targetChannel }) {
    const logger = createChildLogger({
      messageId: message?.id,
      curatorId: curator?.id,
      channelId: message?.channelId,
    });

    if (!message || !curator || !targetChannel) {
      logger.error('Parâmetros obrigatórios ausentes para curadoria.');
      return { success: false, status: 'INVALID_PARAMETERS' };
    }

    // 1. Extração e validação anti-SSRF de URLs
    const safeUrls = await this.extractSafeUrls(message.content);
    if (safeUrls.length === 0) {
      logger.debug('Nenhuma URL pública segura encontrada no conteúdo da mensagem.');
      return { success: false, status: 'NO_URLS_FOUND' };
    }

    // 2. Reserva atômica no banco de dados (eliminação de race condition)
    const claimed = this.claimMessage({
      messageId: message.id,
      curatorId: curator.id,
      channelId: targetChannel.id,
      createdAt: message.createdAt,
    });

    if (!claimed) {
      logger.debug('Mensagem já foi curada ou está em processamento simultâneo.');
      return { success: false, status: 'ALREADY_CURATED' };
    }

    logger.info({ urlsCount: safeUrls.length }, 'Mensagem reservada com sucesso. Processando curadoria...');

    try {
      // 3. Extração resiliente de metadados OpenGraph
      const metadata = await this.extractMetadata(safeUrls[0]);

      // 4. Construção do Embed enriquecido
      const embed = this.buildEmbed({
        message,
        curator,
        urls: safeUrls,
        metadata,
      });

      // 5. Envio com proteção explícita contra abuso de menções (@everyone / @here)
      await targetChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      // 6. Transação atômica de finalização
      this.markCompleted({
        messageId: message.id,
        urls: safeUrls,
      });

      logger.info('Curadoria concluída e persistida com sucesso.');
      return { success: true, status: 'COMPLETED', urls: safeUrls };
    } catch (err) {
      logger.error({ err: err.message || err }, 'Falha durante o processamento da curadoria.');
      this.markFailed(message.id);
      return { success: false, status: 'FAILED', error: err.message || 'Unknown error' };
    }
  }
}

export const curatorService = new CuratorService();
export default curatorService;
