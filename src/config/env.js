import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN é obrigatório e não pode ser vazio.'),
  TARGET_CHANNEL_ID: z
    .string()
    .regex(/^\d{17,20}$/, 'TARGET_CHANNEL_ID deve ser um Snowflake numérico do Discord válido (17 a 20 dígitos).'),
  TRIGGER_EMOJI: z.string().min(1, 'TRIGGER_EMOJI é obrigatório e não pode ser vazio.'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_PATH: z.string().default('database.sqlite'),
  AUTO_CREATE_THREADS: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .default('true')
    .transform((val) => val === true || val === 'true' || val === '1'),
});

/**
 * Valida o ambiente atual contra o schema definido.
 * @param {Record<string, string | undefined>} [customEnv]
 * @returns {z.infer<typeof envSchema>}
 */
export function validateEnv(customEnv = process.env) {
  const result = envSchema.safeParse(customEnv);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    if (customEnv.NODE_ENV !== 'test') {
      console.error(`\x1b[31m[Erro de Configuração] Variáveis de ambiente inválidas:\n${errorDetails}\x1b[0m`);
      console.error('\x1b[33mConsulte o arquivo .env.example para configurar corretamente.\x1b[0m');
      process.exit(1);
    } else {
      throw new Error(`Configuração inválida:\n${errorDetails}`);
    }
  }

  return Object.freeze(result.data);
}

export const env = validateEnv(process.env);
export default env;
