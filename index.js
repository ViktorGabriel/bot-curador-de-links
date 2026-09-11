import { Client, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import { loadEvents } from './src/handlers/eventHandler.js';

dotenv.config();

// Validação de variáveis obrigatórias sem expor valores sensíveis
const requiredEnv = ['DISCORD_TOKEN', 'TARGET_CHANNEL_ID', 'TRIGGER_EMOJI'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`[Segurança] Variáveis de ambiente obrigatórias ausentes: ${missingEnv.join(', ')}`);
  console.error('[Segurança] Configure o arquivo .env com base no .env.example antes de iniciar.');
  process.exit(1);
}

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

// Carrega e registra todos os eventos desacoplados
await loadEvents(client);

// Conecta o bot ao Discord
client.login(process.env.DISCORD_TOKEN);