import { Client, GatewayIntentBits, Partials } from 'discord.js';
import env from './src/config/env.js';
import logger from './src/utils/logger.js';
import { loadEvents } from './src/handlers/eventHandler.js';
import { closeDatabase } from './src/services/database.js';

logger.info({ env: env.NODE_ENV }, 'Iniciando bot-curador-de-links...');

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

// Carrega e registra dinamicamente todos os eventos
await loadEvents(client);

// ==========================================
// Gerenciamento de Ciclo de Vida & Graceful Shutdown
// ==========================================
let isShuttingDown = false;

async function handleGracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn({ signal }, 'Sinal de encerramento recebido. Iniciando graceful shutdown...');

  try {
    // 1. Encerra conexão do cliente Discord
    if (client.isReady()) {
      logger.info('Desconectando cliente Discord Gateway...');
      client.destroy();
    }

    // 2. Fecha com segurança o banco de dados SQLite (WAL flush)
    logger.info('Fechando conexão com banco de dados SQLite...');
    closeDatabase();

    logger.info('Aplicação encerrada graciosamente com sucesso.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Erro inesperado durante graceful shutdown.');
    process.exit(1);
  }
}

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled Rejection detectada no processo.');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught Exception crítica. Encerrando processo.');
  handleGracefulShutdown('uncaughtException');
});

// Conecta o bot ao Discord
client.login(env.DISCORD_TOKEN).catch((err) => {
  logger.fatal({ err }, 'Falha ao autenticar no Discord. Verifique o DISCORD_TOKEN.');
  process.exit(1);
});