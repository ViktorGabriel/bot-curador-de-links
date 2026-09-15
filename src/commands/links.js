import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import {
  searchLinks,
  getRecentLinks,
  getLinksStats,
  getAllLinksForExport,
} from '../services/database.js';
import { CATEGORIES, getCategoryConfig } from '../utils/categoryHelper.js';

export const data = new SlashCommandBuilder()
  .setName('links')
  .setDescription('Gerencie, pesquise e exporte links curados pelo bot')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('buscar')
      .setDescription('Busca links curados por palavra-chave no título, descrição ou URL')
      .addStringOption((option) =>
        option
          .setName('termo')
          .setDescription('Termo de pesquisa (ex: node, figma, tutorial)')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('categoria')
          .setDescription('Filtrar por categoria específica')
          .setRequired(false)
          .addChoices(
            { name: '💻 Dev & Código', value: 'dev' },
            { name: '🎨 Design & UI/UX', value: 'design' },
            { name: '📚 Artigos & Leitura', value: 'reading' },
            { name: '🎥 Vídeos & Aulas', value: 'video' },
            { name: '📌 Geral', value: 'general' }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('recentes')
      .setDescription('Exibe os links adicionados mais recentemente')
      .addIntegerOption((option) =>
        option
          .setName('limite')
          .setDescription('Quantidade de links (1 a 10)')
          .setMinValue(1)
          .setMaxValue(10)
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName('categoria')
          .setDescription('Filtrar por categoria')
          .setRequired(false)
          .addChoices(
            { name: '💻 Dev & Código', value: 'dev' },
            { name: '🎨 Design & UI/UX', value: 'design' },
            { name: '📚 Artigos & Leitura', value: 'reading' },
            { name: '🎥 Vídeos & Aulas', value: 'video' },
            { name: '📌 Geral', value: 'general' }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('stats')
      .setDescription('Exibe estatísticas de curadoria e ranking de curadores')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('exportar')
      .setDescription('Exporta todos os links curados para um arquivo')
      .addStringOption((option) =>
        option
          .setName('formato')
          .setDescription('Formato do arquivo de exportação')
          .setRequired(true)
          .addChoices(
            { name: 'Markdown (.md) - Ideal para Obsidian/Notion', value: 'markdown' },
            { name: 'JSON (.json) - Formato bruto estruturado', value: 'json' },
            { name: 'CSV (.csv) - Compatível com Excel/Planilhas', value: 'csv' }
          )
      )
  );

/**
 * Trata o subcomando /links buscar
 */
export async function handleSearch(interaction) {
  const query = interaction.options.getString('termo');
  const category = interaction.options.getString('categoria') || undefined;

  const results = searchLinks({ query, category, limit: 5 });

  if (results.length === 0) {
    return interaction.reply({
      content: `🔍 Nenhum link encontrado para o termo **"${query}"**${category ? ` na categoria **${category}**` : ''}.`,
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`🔍 Resultados para: "${query}"`)
    .setColor(0x5865f2)
    .setFooter({ text: `${results.length} resultado(s) exibido(s)` })
    .setTimestamp();

  for (const item of results) {
    const cat = getCategoryConfig(item.category);
    const title = item.title || item.url;
    const desc = item.description ? `> ${item.description.slice(0, 140)}...\n` : '';
    embed.addFields({
      name: `${cat.emoji} ${title.slice(0, 100)}`,
      value: `${desc}[Acessar Link](${item.url}) • Curado em <t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:R>`,
      inline: false,
    });
  }

  return interaction.reply({ embeds: [embed] });
}

/**
 * Trata o subcomando /links recentes
 */
export async function handleRecent(interaction) {
  const limit = interaction.options.getInteger('limite') || 5;
  const category = interaction.options.getString('categoria') || null;

  const links = getRecentLinks({ limit, category });

  if (links.length === 0) {
    return interaction.reply({
      content: '📁 Nenhum link curado foi encontrado no momento.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`📁 Últimos Links Curados${category ? ` (${category})` : ''}`)
    .setColor(0x2ecc71)
    .setFooter({ text: `Exibindo ${links.length} links recentes` })
    .setTimestamp();

  for (const item of links) {
    const cat = getCategoryConfig(item.category);
    const title = item.title || item.url;
    embed.addFields({
      name: `${cat.emoji} ${title.slice(0, 100)}`,
      value: `[${item.url}](${item.url})\nCurado em <t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:R>`,
      inline: false,
    });
  }

  return interaction.reply({ embeds: [embed] });
}

/**
 * Trata o subcomando /links stats
 */
export async function handleStats(interaction) {
  const stats = getLinksStats();

  const embed = new EmbedBuilder()
    .setTitle('📊 Painel de Estatísticas de Curadoria')
    .setColor(0x3498db)
    .addFields(
      { name: '🔗 Total de Links Salvos', value: `**${stats.totalLinks}** links`, inline: true },
      { name: '📌 Mensagens Curadas', value: `**${stats.totalCuratedMessages}** mensagens`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true }
    );

  // Categorias
  const categoriesList = Object.entries(CATEGORIES).map(([key, cfg]) => {
    const count = stats.categoryCounts[key] || 0;
    return `${cfg.emoji} **${cfg.label}:** ${count}`;
  }).join('\n');

  embed.addFields({ name: '🏷️ Distribuição por Categoria', value: categoriesList || 'Nenhum dado', inline: false });

  // Top Curadores
  if (stats.topCurators.length > 0) {
    const curatorsList = stats.topCurators
      .map((c, index) => `${index + 1}. <@${c.curator_id}> — **${c.count}** curadorias`)
      .join('\n');
    embed.addFields({ name: '🏆 Top Curadores', value: curatorsList, inline: false });
  }

  embed.setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

/**
 * Trata o subcomando /links exportar
 */
export async function handleExport(interaction) {
  const format = interaction.options.getString('formato');
  const allLinks = getAllLinksForExport();

  if (allLinks.length === 0) {
    return interaction.reply({
      content: '⚠️ Não há links curados cadastrados para exportação.',
      ephemeral: true,
    });
  }

  let content = '';
  let filename = '';

  if (format === 'markdown') {
    filename = `links-curados-${new Date().toISOString().slice(0, 10)}.md`;
    content = `# 📚 Links Curados (Discord Link Curator)\n\n`;
    content += `*Exportado em ${new Date().toLocaleString('pt-BR')}*\n\n`;

    for (const item of allLinks) {
      const cat = getCategoryConfig(item.category);
      content += `### ${cat.emoji} [${item.title || item.url}](${item.url})\n`;
      if (item.description) content += `> ${item.description}\n\n`;
      content += `- **Categoria:** ${cat.label}\n`;
      content += `- **Data:** ${item.created_at}\n\n---\n\n`;
    }
  } else if (format === 'json') {
    filename = `links-curados-${new Date().toISOString().slice(0, 10)}.json`;
    content = JSON.stringify(allLinks, null, 2);
  } else if (format === 'csv') {
    filename = `links-curados-${new Date().toISOString().slice(0, 10)}.csv`;
    content = 'id,url,title,category,created_at,curator_id\n';
    for (const item of allLinks) {
      const cleanTitle = (item.title || '').replace(/"/g, '""');
      content += `"${item.id}","${item.url}","${cleanTitle}","${item.category || 'general'}","${item.created_at}","${item.curator_id}"\n`;
    }
  }

  const attachment = new AttachmentBuilder(Buffer.from(content, 'utf-8'), { name: filename });

  return interaction.reply({
    content: `✅ Exportação gerada com sucesso! (**${allLinks.length} links** no formato \`${format.toUpperCase()}\`)`,
    files: [attachment],
    ephemeral: true,
  });
}

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'buscar':
      return handleSearch(interaction);
    case 'recentes':
      return handleRecent(interaction);
    case 'stats':
      return handleStats(interaction);
    case 'exportar':
      return handleExport(interaction);
    default:
      return interaction.reply({ content: 'Subcomando desconhecido.', ephemeral: true });
  }
}

export default {
  data,
  execute,
  handleSearch,
  handleRecent,
  handleStats,
  handleExport,
};
