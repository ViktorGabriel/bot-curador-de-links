import { describe, it, expect } from 'vitest';
import { buildCuratedEmbed } from '../../src/utils/embedBuilder.js';

describe('Embed Builder Unit Tests', () => {
  const mockMessage = {
    content: 'Dê uma olhada neste artigo excelente sobre arquitetura de software.',
    url: 'https://discord.com/channels/1/2/3',
    createdAt: new Date('2026-09-11T12:00:00Z'),
    author: {
      tag: 'DevUser#0001',
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/user.png',
    },
  };

  const mockCurator = {
    tag: 'CuratorUser#9999',
  };

  const mockUrls = ['https://example.com/artigo-arquitetura'];

  it('deve construir o embed com metadados do OpenGraph completos', () => {
    const mockMetadata = {
      title: 'Arquitetura Limpa em Node.js',
      description: 'Um guia prático e completo sobre Clean Architecture.',
      image: 'https://example.com/capa.jpg',
      favicon: 'https://example.com/favicon.ico',
      siteName: 'TechBlog',
    };

    const embed = buildCuratedEmbed({
      message: mockMessage,
      curator: mockCurator,
      urls: mockUrls,
      metadata: mockMetadata,
    });

    const json = embed.toJSON();

    expect(json.color).toBe(0x5865F2);
    expect(json.author.name).toBe('DevUser#0001');
    expect(json.title).toBe('Arquitetura Limpa em Node.js');
    expect(json.url).toBe('https://example.com/artigo-arquitetura');
    expect(json.description).toContain('Um guia prático e completo');
    expect(json.description).toContain('Dê uma olhada neste artigo');
    expect(json.description).toContain('[Ir para a mensagem original](https://discord.com/channels/1/2/3)');
    expect(json.thumbnail.url).toBe('https://example.com/capa.jpg');
    expect(json.footer.text).toBe('TechBlog • Curado por @CuratorUser#9999');
    expect(json.timestamp).toBe('2026-09-11T12:00:00.000Z');
  });

  it('deve truncar títulos e descrições excessivamente longas para respeitar limites do Discord', () => {
    const longTitle = 'A'.repeat(350);
    const longDescription = 'B'.repeat(500);
    const longContent = 'C'.repeat(500);

    const embed = buildCuratedEmbed({
      message: { ...mockMessage, content: longContent },
      curator: mockCurator,
      urls: mockUrls,
      metadata: {
        title: longTitle,
        description: longDescription,
      },
    });

    const json = embed.toJSON();
    expect(json.title.length).toBeLessThanOrEqual(256);
    expect(json.description.length).toBeLessThanOrEqual(4096);
  });

  it('deve construir embed funcional mesmo quando metadados OpenGraph forem nulos', () => {
    const embed = buildCuratedEmbed({
      message: mockMessage,
      curator: mockCurator,
      urls: mockUrls,
      metadata: null,
    });

    const json = embed.toJSON();
    expect(json.title).toBeUndefined();
    expect(json.description).toContain('https://example.com/artigo-arquitetura');
    expect(json.footer.text).toBe('Curado por @CuratorUser#9999');
  });

  it('deve aplicar cores e badges de categorias temáticas', () => {
    const mockCategory = {
      key: 'dev',
      label: 'Dev & Código',
      emoji: '💻',
      color: 0x2ecc71,
    };

    const embed = buildCuratedEmbed({
      message: mockMessage,
      curator: mockCurator,
      urls: mockUrls,
      metadata: { title: 'Dicas de Node.js' },
      category: mockCategory,
    });

    const json = embed.toJSON();
    expect(json.color).toBe(0x2ecc71);
    expect(json.description).toContain('💻 **Link salvo [Dev & Código]:**');
    expect(json.footer.text).toContain('Dev & Código');
  });
});

