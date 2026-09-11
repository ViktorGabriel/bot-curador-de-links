import { describe, it, expect } from 'vitest';
import { isPrivateIp, isSafePublicUrl, extractSafeUrls } from '../../src/utils/urlValidator.js';
import { validateEnv } from '../../src/config/env.js';

describe('SSRF Protection & URL Validation', () => {
  it('deve identificar endereços de IP privados, loopback e metadados de nuvem como inseguros', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
  });

  it('deve identificar endereços IP públicos como seguros', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
  });

  it('deve bloquear URLs direcionadas a alvos internos e SSRF', async () => {
    const localhostResult = await isSafePublicUrl('http://localhost:3000');
    expect(localhostResult.safe).toBe(false);

    const loopbackIpResult = await isSafePublicUrl('http://127.0.0.1:8080');
    expect(loopbackIpResult.safe).toBe(false);

    const metadataResult = await isSafePublicUrl('http://169.254.169.254/latest/meta-data/');
    expect(metadataResult.safe).toBe(false);

    const rfc1918Result = await isSafePublicUrl('http://192.168.0.1/admin');
    expect(rfc1918Result.safe).toBe(false);

    const javascriptProto = await isSafePublicUrl('javascript:alert(1)');
    expect(javascriptProto.safe).toBe(false);
  });

  it('deve permitir URLs de domínios públicos legítimos', async () => {
    const githubResult = await isSafePublicUrl('https://github.com');
    expect(githubResult.safe).toBe(true);
    expect(githubResult.url).toBe('https://github.com/');
  });

  it('deve extrair e filtrar somente URLs públicas seguras de um texto de mensagem', async () => {
    const text = 'Confira este link https://github.com e este interno http://127.0.0.1:8000';
    const urls = await extractSafeUrls(text);

    expect(urls).toContain('https://github.com/');
    expect(urls.some((u) => u.includes('127.0.0.1'))).toBe(false);
  });
});

describe('Zod Environment Schema Validation', () => {
  it('deve validar com sucesso variáveis corretas', () => {
    const validConfig = {
      DISCORD_TOKEN: 'super-secret-token',
      TARGET_CHANNEL_ID: '123456789012345678',
      TRIGGER_EMOJI: '📌',
      NODE_ENV: 'test',
    };

    const parsed = validateEnv(validConfig);
    expect(parsed.DISCORD_TOKEN).toBe('super-secret-token');
    expect(parsed.TARGET_CHANNEL_ID).toBe('123456789012345678');
    expect(parsed.TRIGGER_EMOJI).toBe('📌');
    expect(parsed.LOG_LEVEL).toBe('info');
  });

  it('deve rejeitar Snowflake inválido no TARGET_CHANNEL_ID', () => {
    const invalidConfig = {
      DISCORD_TOKEN: 'valid-token',
      TARGET_CHANNEL_ID: 'invalid-channel-id-abc',
      TRIGGER_EMOJI: '📌',
      NODE_ENV: 'test',
    };

    expect(() => validateEnv(invalidConfig)).toThrowError(/Snowflake numérico/);
  });

  it('deve rejeitar quando DISCORD_TOKEN estiver ausente', () => {
    const invalidConfig = {
      TARGET_CHANNEL_ID: '123456789012345678',
      TRIGGER_EMOJI: '📌',
      NODE_ENV: 'test',
    };

    expect(() => validateEnv(invalidConfig)).toThrowError(/DISCORD_TOKEN/);
  });
});
