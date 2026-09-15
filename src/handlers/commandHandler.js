import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Collection } from 'discord.js';
import logger from '../utils/logger.js';

/**
 * Carrega todos os comandos presentes em src/commands.
 * @returns {Promise<Collection<string, Object>>}
 */
export async function loadCommands() {
  const commands = new Collection();
  const commandsPath = path.resolve('src/commands');

  if (!fs.existsSync(commandsPath)) {
    logger.warn({ commandsPath }, 'Diretório de comandos não encontrado.');
    return commands;
  }

  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const fileUrl = pathToFileURL(filePath).href;
    const module = await import(fileUrl);
    const command = module.default || module;

    if (!command || !command.data || typeof command.execute !== 'function') {
      logger.warn({ file }, 'Arquivo de comando não exporta uma estrutura válida (data e execute).');
      continue;
    }

    commands.set(command.data.name, command);
  }

  logger.info({ count: commands.size }, 'Comandos Slash carregados na memória com sucesso.');
  return commands;
}

/**
 * Registra os comandos na API REST do Discord para a aplicação.
 * @param {import('discord.js').Client} client
 */
export async function registerCommands(client) {
  if (!client.application) {
    logger.warn('client.application não está disponível para registro de comandos.');
    return;
  }

  try {
    const commandPayloads = client.commands.map((cmd) => cmd.data.toJSON());
    logger.info({ count: commandPayloads.length }, 'Registrando Slash Commands no Discord...');
    await client.application.commands.set(commandPayloads);
    logger.info('Slash Commands registrados com sucesso no Discord.');
  } catch (err) {
    logger.error({ err: err.message }, 'Falha ao registrar Slash Commands no Discord.');
  }
}
