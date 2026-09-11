import { isMessageSaved, saveLink } from '../services/database.js';
import { extractLinkMetadata } from '../services/metadataScraper.js';
import { buildCuratedEmbed } from '../utils/embedBuilder.js';

// Expressão regular para capturar URLs HTTP/HTTPS
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

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
        console.error('Erro ao buscar partial da reação:', err);
        return;
      }
    }

    const { message } = reaction;

    if (message.partial) {
      try {
        await message.fetch();
      } catch (err) {
        console.error('Erro ao buscar partial da mensagem:', err);
        return;
      }
    }

    // Verifica se o emoji corresponde ao configurado
    if (reaction.emoji.name !== process.env.TRIGGER_EMOJI) return;

    // Consulta persistência SQLite para evitar duplicatas
    if (isMessageSaved(message.id)) return;

    // Extrai URLs do texto
    const foundUrls = message.content.match(URL_REGEX);
    if (!foundUrls || foundUrls.length === 0) return;

    const targetChannel = client.channels.cache.get(process.env.TARGET_CHANNEL_ID);
    if (!targetChannel || !targetChannel.isTextBased()) {
      console.error('Canal de destino inválido ou não encontrado.');
      return;
    }

    // Extração leve de metadados do primeiro link com timeout de 3 segundos
    const metadata = await extractLinkMetadata(foundUrls[0]);

    // Constrói o embed através do utilitário desacoplado
    const embed = buildCuratedEmbed({
      message,
      curator: user,
      urls: foundUrls,
      metadata,
    });

    // Envia para o canal de destino
    await targetChannel.send({ embeds: [embed] });

    // Registra os links salvos no banco SQLite
    for (const url of foundUrls) {
      saveLink({
        messageId: message.id,
        url,
        userId: user.id,
        channelId: targetChannel.id,
        createdAt: message.createdAt,
      });
    }
  },
};
