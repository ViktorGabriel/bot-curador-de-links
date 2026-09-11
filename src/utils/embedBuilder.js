import { EmbedBuilder } from 'discord.js';

/**
 * Valida se uma string é uma URL HTTP/HTTPS segura para embeds do Discord.
 * @param {string|null|undefined} str
 * @returns {boolean}
 */
function isValidHttpUrl(str) {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('http://') || str.startsWith('https://');
}

/**
 * Constrói o Embed Discord para o link curado com metadados do OpenGraph e contexto da mensagem.
 *
 * @param {Object} params
 * @param {import('discord.js').Message} params.message - Mensagem original do Discord
 * @param {import('discord.js').User} params.curator - Usuário que reagiu
 * @param {string[]} params.urls - URLs encontradas
 * @param {Object|null} params.metadata - Metadados extraídos via OpenGraph
 * @returns {EmbedBuilder}
 */
export function buildCuratedEmbed({ message, curator, urls, metadata }) {
  const primaryUrl = urls[0];
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    });

  // Título com link para o artigo principal
  if (metadata?.title) {
    embed.setTitle(metadata.title.slice(0, 256));
    embed.setURL(primaryUrl);
  }

  // Descrição: resumo do OpenGraph + links e contexto da mensagem original
  let description = '';
  if (metadata?.description) {
    description += `> ${metadata.description.slice(0, 300)}\n\n`;
  }

  description += `📌 **Link salvo:**\n${urls.join('\n')}\n\n` +
    `**Contexto original:**\n${message.content.slice(0, 300)}${message.content.length > 300 ? '...' : ''}\n\n` +
    `[Ir para a mensagem original](${message.url})`;

  embed.setDescription(description);

  // Renderiza imagem de capa ou favicon como thumbnail apenas se for URL válida
  if (isValidHttpUrl(metadata?.image)) {
    embed.setThumbnail(metadata.image);
  } else if (isValidHttpUrl(metadata?.favicon)) {
    embed.setThumbnail(metadata.favicon);
  }

  // Rodapé com nome do portal e créditos ao curador
  const footerText = metadata?.siteName
    ? `${metadata.siteName} • Curado por @${curator.tag}`
    : `Curado por @${curator.tag}`;

  embed.setFooter({
    text: footerText,
    iconURL: isValidHttpUrl(metadata?.favicon) ? metadata.favicon : undefined,
  });

  embed.setTimestamp(message.createdAt);

  return embed;
}
