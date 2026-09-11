import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Carrega e registra dinamicamente todos os eventos presentes em src/events.
 *
 * @param {import('discord.js').Client} client
 */
export async function loadEvents(client) {
  const eventsPath = path.resolve('src/events');
  if (!fs.existsSync(eventsPath)) return;

  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const fileUrl = pathToFileURL(filePath).href;
    const { default: event } = await import(fileUrl);

    if (!event || !event.name || typeof event.execute !== 'function') {
      console.warn(`[EventHandler] Arquivo ${file} não exporta um evento válido.`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  console.log(`[EventHandler] ${eventFiles.length} evento(s) registrado(s) com sucesso.`);
}
