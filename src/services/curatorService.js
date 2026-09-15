import {
  claimMessageForCuration as defaultClaim,
  markMessageCompleted as defaultComplete,
  markMessageFailed as defaultFail,
  findExistingUrls as defaultFindExisting,
} from './database.js';
import { extractSafeUrls as defaultExtractSafeUrls } from '../utils/urlValidator.js';
import { extractLinkMetadata as defaultExtractMetadata } from './metadataScraper.js';
import { buildCuratedEmbed as defaultBuildEmbed } from '../utils/embedBuilder.js';
import { determineCategory as defaultDetermineCategory } from '../utils/categoryHelper.js';
import { createChildLogger } from '../utils/logger.js';
import env from '../config/env.js';

export class CuratorService {
  /**
   * @param {Object} [dependencies]
   * @param {typeof defaultClaim} [dependencies.claimMessage]
   * @param {typeof defaultComplete} [dependencies.markCompleted]
   * @param {typeof defaultFail} [dependencies.markFailed]
   * @param {typeof defaultFindExisting} [dependencies.findExistingUrls]
   * @param {typeof defaultExtractSafeUrls} [dependencies.extractSafeUrls]
   * @param {typeof defaultExtractMetadata} [dependencies.extractMetadata]
   * @param {typeof defaultBuildEmbed} [dependencies.buildEmbed]
   * @param {typeof defaultDetermineCategory} [dependencies.determineCategory]
   * @param {boolean} [dependencies.autoCreateThreads]
   */
  constructor(dependencies = {}) {
    this.claimMessage = dependencies.claimMessage || defaultClaim;
    this.markCompleted = dependencies.markCompleted || defaultComplete;
    this.markFailed = dependencies.markFailed || defaultFail;
    this.findExistingUrls = dependencies.findExistingUrls || defaultFindExisting;
    this.extractSafeUrls = dependencies.extractSafeUrls || defaultExtractSafeUrls;
    this.extractMetadata = dependencies.extractMetadata || defaultExtractMetadata;
    this.buildEmbed = dependencies.buildEmbed || defaultBuildEmbed;
    this.determineCategory = dependencies.determineCategory || defaultDetermineCategory;
    this.autoCreateThreads = dependencies.autoCreateThreads ?? env.AUTO_CREATE_THREADS;
  }

  /**
   * Executa o fluxo de negócio completo de curadoria de mensagem.
   *
   * @param {Object} params
   * @param {import('discord.js').Message} params.message
   * @param {import('discord.js').User} params.curator
   * @param {import('discord.js').TextBasedChannel} params.targetChannel
   * @param {string} [params.emoji]
   * @returns {Promise<{ success: boolean, status: string, urls?: string[], error?: string, existingUrls?: Array<any> }>}
   */
  async curateMessage({ message, curator, targetChannel, emoji }) {
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

    // 2. Deduplicação inteligente de links
    const existing = this.findExistingUrls(safeUrls);
    if (existing.length > 0 && existing.length === safeUrls.length) {
      logger.info({ existingCount: existing.length }, 'Todas as URLs da mensagem já foram curadas anteriormente.');
      return { success: false, status: 'URLS_ALREADY_CURATED', urls: safeUrls, existingUrls: existing };
    }

    // 3. Reserva atômica no banco de dados (eliminação de race condition)
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
      // 4. Determinação temática de categoria
      const categoryConfig = this.determineCategory({
        emoji,
        url: safeUrls[0],
      });

      // 5. Extração resiliente de metadados OpenGraph
      const metadata = await this.extractMetadata(safeUrls[0]);

      // 6. Construção do Embed enriquecido com categoria
      const embed = this.buildEmbed({
        message,
        curator,
        urls: safeUrls,
        metadata,
        category: categoryConfig,
      });

      // 7. Envio com proteção explícita contra abuso de menções (@everyone / @here)
      const sentMessage = await targetChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      // 8. Criação automática de thread para discussões
      if (this.autoCreateThreads && sentMessage && typeof sentMessage.startThread === 'function') {
        try {
          const threadName = metadata?.title
            ? `💬 ${metadata.title.slice(0, 90)}`
            : `💬 Discussão: ${curator.username || curator.tag}`;

          await sentMessage.startThread({
            name: threadName,
            autoArchiveDuration: 1440,
          });
          logger.debug({ threadName }, 'Thread de discussão criada com sucesso.');
        } catch (threadErr) {
          logger.warn({ err: threadErr.message }, 'Falha opcional ao criar thread de discussão.');
        }
      }

      // 9. Transação atômica de finalização persistindo links e categoria
      this.markCompleted({
        messageId: message.id,
        urls: safeUrls,
        metadata,
        category: categoryConfig.key,
        authorId: message.author?.id,
      });

      logger.info({ category: categoryConfig.key }, 'Curadoria concluída e persistida com sucesso.');
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
