import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { data, execute, handleSearch, handleRecent, handleStats, handleExport } from '../../src/commands/links.js';
import { initDatabase, closeDatabase, claimMessageForCuration, markMessageCompleted } from '../../src/services/database.js';
import { loadCommands } from '../../src/handlers/commandHandler.js';

describe('/links Slash Command Unit Tests', () => {
  beforeEach(() => {
    closeDatabase();
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
    vi.restoreAllMocks();
  });

  it('deve exportar estrutura de comando válida para o Discord', () => {
    expect(data.name).toBe('links');
    const json = data.toJSON();
    expect(json.options.map((opt) => opt.name)).toEqual(['buscar', 'recentes', 'stats', 'exportar']);
  });

  it('deve executar handleStats e responder com embed contendo métricas', async () => {
    claimMessageForCuration({ messageId: 'msg-cmd-1', curatorId: 'curator-abc', channelId: 'ch-1' });
    markMessageCompleted({
      messageId: 'msg-cmd-1',
      urls: ['https://example.com/item1'],
      category: 'dev',
    });

    const mockReply = vi.fn().mockResolvedValue({});
    const interaction = {
      reply: mockReply,
    };

    await handleStats(interaction);

    expect(mockReply).toHaveBeenCalledTimes(1);
    const callArgs = mockReply.mock.calls[0][0];
    expect(callArgs.embeds).toBeDefined();
    expect(callArgs.embeds[0].data.title).toContain('Estatísticas');
  });

  it('deve executar handleExport gerando arquivo Markdown anexado', async () => {
    claimMessageForCuration({ messageId: 'msg-cmd-2', curatorId: 'curator-abc', channelId: 'ch-1' });
    markMessageCompleted({
      messageId: 'msg-cmd-2',
      urls: ['https://example.com/guide'],
      metadata: { title: 'Guia Completo' },
      category: 'reading',
    });

    const mockReply = vi.fn().mockResolvedValue({});
    const interaction = {
      options: {
        getString: vi.fn().mockReturnValue('markdown'),
      },
      reply: mockReply,
    };

    await handleExport(interaction);

    expect(mockReply).toHaveBeenCalledTimes(1);
    const callArgs = mockReply.mock.calls[0][0];
    expect(callArgs.files).toHaveLength(1);
    expect(callArgs.files[0].name).toMatch(/links-curados-.*\.md/);
  });

  it('deve responder quando a busca não encontrar resultados', async () => {
    const mockReply = vi.fn().mockResolvedValue({});
    const interaction = {
      options: {
        getString: vi.fn().mockImplementation((name) => {
          if (name === 'termo') return 'inexistente';
          return null;
        }),
      },
      reply: mockReply,
    };

    await handleSearch(interaction);

    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Nenhum link encontrado'),
        ephemeral: true,
      })
    );
  });

  it('deve carregar os comandos corretamente via loadCommands', async () => {
    const commands = await loadCommands();
    expect(commands.has('links')).toBe(true);
    expect(commands.get('links').data.name).toBe('links');
  });
});
