import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { isMessageSaved, saveLink } from './db.js';
import { extractLinkMetadata } from './metadata.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ],
});

// Regex simples para capturar URLs HTTP/HTTPS
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

client.once('clientReady', (c) => {
  console.log(`Bot online com sucesso como ${c.user.tag}`);
});

client.on('messageReactionAdd', async (reaction, user) => {
  // Ignora reações vindas de bots
  if (user.bot) return;

  // Garante que a estrutura da reação e mensagem estejam completas (partials)
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

  // Evita reprocessar a mesma mensagem consultando o banco SQLite local indexado
  if (isMessageSaved(message.id)) return;

  // Extrai links do texto
  const foundUrls = message.content.match(URL_REGEX);
  if (!foundUrls || foundUrls.length === 0) return;

  const targetChannel = client.channels.cache.get(process.env.TARGET_CHANNEL_ID);
  if (!targetChannel || !targetChannel.isTextBased()) {
    console.error('Canal de destino inválido ou não encontrado.');
    return;
  }

  // Extrai metadados OpenGraph do primeiro link com timeout de 3 segundos
  const metadata = await extractLinkMetadata(foundUrls[0]);

  // Monta o embed limpo e enriquecido com os metadados do artigo
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    });

  if (metadata?.title) {
    embed.setTitle(metadata.title.slice(0, 256));
    embed.setURL(foundUrls[0]);
  }

  let description = '';
  if (metadata?.description) {
    description += `> ${metadata.description.slice(0, 300)}\n\n`;
  }

  description += `📌 **Link salvo:**\n${foundUrls.join('\n')}\n\n` +
    `**Contexto original:**\n${message.content.slice(0, 300)}${message.content.length > 300 ? '...' : ''}\n\n` +
    `[Ir para a mensagem original](${message.url})`;

  embed.setDescription(description);

  // Renderiza thumbnail com imagem do OpenGraph ou favicon
  if (metadata?.image) {
    embed.setThumbnail(metadata.image);
  } else if (metadata?.favicon) {
    embed.setThumbnail(metadata.favicon);
  }

  const footerText = metadata?.siteName
    ? `${metadata.siteName} • Curado por @${user.tag}`
    : `Curado por @${user.tag}`;

  embed.setFooter({
    text: footerText,
    iconURL: metadata?.favicon || undefined,
  });

  embed.setTimestamp(message.createdAt);

  await targetChannel.send({ embeds: [embed] });

  // Persiste no SQLite com as colunas especificadas
  for (const url of foundUrls) {
    saveLink({
      messageId: message.id,
      url,
      userId: user.id,
      channelId: targetChannel.id,
      createdAt: message.createdAt,
    });
  }
});

client.login(process.env.DISCORD_TOKEN);