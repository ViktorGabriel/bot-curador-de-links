import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import logger from '../utils/logger.js';

/**
 * Carrega e registra dinamicamente todos os eventos presentes em src/events.
 *
 * @param {import('discord.js').Client} client
 */
export async function loadEvents(client) {
  const eventsPath = path.resolve('src/events');
  if (!fs.existsSync(eventsPath)) {
    logger.warn({ eventsPath }, 'Diretório de eventos não encontrado.');
    return;
  }

  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const fileUrl = pathToFileURL(filePath).href;
    const { default: event } = await import(fileUrl);

    if (!event || !event.name || typeof event.execute !== 'function') {
      logger.warn({ file }, 'Arquivo não exporta uma estrutura de evento válida.');
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  logger.info({ count: eventFiles.length }, 'Eventos registrados com sucesso no cliente Discord.');
}
