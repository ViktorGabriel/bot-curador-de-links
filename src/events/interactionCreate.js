import logger, { createChildLogger } from '../utils/logger.js';

export default {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands?.get(interaction.commandName);

    if (!command) {
      logger.warn({ commandName: interaction.commandName }, 'Comando não reconhecido ou não carregado.');
      return interaction.reply({
        content: '❌ Este comando não está disponível ou não foi encontrado.',
        ephemeral: true,
      });
    }

    const commandLogger = createChildLogger({
      commandName: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });

    try {
      commandLogger.info('Executando Slash Command...');
      await command.execute(interaction, client);
      commandLogger.info('Slash Command executado com sucesso.');
    } catch (err) {
      commandLogger.error({ err: err.message }, 'Erro durante a execução do comando.');

      const replyPayload = {
        content: '❌ Ocorreu um erro ao executar este comando. Tente novamente mais tarde.',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyPayload).catch(() => {});
      } else {
        await interaction.reply(replyPayload).catch(() => {});
      }
    }
  },
};
