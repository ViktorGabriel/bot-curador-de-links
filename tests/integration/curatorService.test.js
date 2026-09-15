import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initDatabase,
  closeDatabase,
  getDatabase,
  claimMessageForCuration,
  markMessageCompleted,
  markMessageFailed,
} from '../../src/services/database.js';
import { CuratorService } from '../../src/services/curatorService.js';

describe('CuratorService Integration Tests', () => {
  beforeEach(() => {
    closeDatabase();
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
    vi.restoreAllMocks();
  });

  it('deve orquestrar curadoria com sucesso sem depender de conexão real com o Discord', async () => {
    const mockSend = vi.fn().mockResolvedValue({ id: 'sent-message-id' });
    const targetChannel = {
      id: '998877665544332211',
      send: mockSend,
    };

    const mockMessage = {
      id: 'message-1001',
      content: 'Confira as novidades em https://github.com/blog',
      channelId: '112233445566778899',
      createdAt: new Date(),
      author: {
        tag: 'Autor#1234',
        displayAvatarURL: () => 'https://example.com/avatar.png',
      },
    };

    const mockCurator = {
      id: 'curator-2002',
      tag: 'Curador#5678',
    };

    const service = new CuratorService({
      claimMessage: claimMessageForCuration,
      markCompleted: markMessageCompleted,
      markFailed: markMessageFailed,
      extractSafeUrls: vi.fn().mockResolvedValue(['https://github.com/blog']),
      extractMetadata: vi.fn().mockResolvedValue({
        title: 'Blog do GitHub',
        description: 'Novidades para desenvolvedores',
      }),
    });

    const result = await service.curateMessage({
      message: mockMessage,
      curator: mockCurator,
      targetChannel,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Valida se o envio incluiu proteção contra mass mention
    const sendPayload = mockSend.mock.calls[0][0];
    expect(sendPayload.allowedMentions).toEqual({ parse: [] });
    expect(sendPayload.embeds).toHaveLength(1);

    // Valida persistência no banco SQLite em memória
    const db = getDatabase();
    const curatedMsg = db.prepare('SELECT status FROM curated_messages WHERE message_id = ?').get('message-1001');
    expect(curatedMsg.status).toBe('COMPLETED');

    const links = db.prepare('SELECT url FROM saved_links WHERE message_id = ?').all('message-1001');
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://github.com/blog');
  });

  it('deve eliminar condição de corrida e enviar apenas um embed se dois usuários reagirem ao mesmo tempo', async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const targetChannel = {
      id: '998877665544332211',
      send: mockSend,
    };

    const mockMessage = {
      id: 'message-race-condition',
      content: 'Link compartilhado: https://vitest.dev',
      channelId: '112233445566778899',
      createdAt: new Date(),
      author: {
        tag: 'Autor#1234',
        displayAvatarURL: () => 'https://example.com/avatar.png',
      },
    };

    const curator1 = { id: 'curator-1', tag: 'UserOne#0001' };
    const curator2 = { id: 'curator-2', tag: 'UserTwo#0002' };

    const service = new CuratorService({
      claimMessage: claimMessageForCuration,
      markCompleted: markMessageCompleted,
      markFailed: markMessageFailed,
      extractSafeUrls: vi.fn().mockResolvedValue(['https://vitest.dev']),
      extractMetadata: vi.fn().mockResolvedValue({ title: 'Vitest' }),
    });

    // Dispara duas curadorias simultâneas para o mesmo message.id
    const [res1, res2] = await Promise.all([
      service.curateMessage({ message: mockMessage, curator: curator1, targetChannel }),
      service.curateMessage({ message: mockMessage, curator: curator2, targetChannel }),
    ]);

    // Exatamente uma deve ter sucesso e a outra ser rejeitada por já estar curada/em processamento
    const results = [res1, res2];
    const successCount = results.filter((r) => r.success).length;
    const skippedCount = results.filter((r) => r.status === 'ALREADY_CURATED').length;

    expect(successCount).toBe(1);
    expect(skippedCount).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('deve marcar o status como FAILED no banco se o envio ao Discord falhar', async () => {
    const targetChannel = {
      id: '998877665544332211',
      send: vi.fn().mockRejectedValue(new Error('Discord API Rate Limit 429')),
    };

    const mockMessage = {
      id: 'message-failure',
      content: 'https://example.com/test',
      channelId: '112233445566778899',
      createdAt: new Date(),
      author: {
        tag: 'Autor#1234',
        displayAvatarURL: () => 'https://example.com/avatar.png',
      },
    };

    const service = new CuratorService({
      claimMessage: claimMessageForCuration,
      markCompleted: markMessageCompleted,
      markFailed: markMessageFailed,
      extractSafeUrls: vi.fn().mockResolvedValue(['https://example.com/test']),
      extractMetadata: vi.fn().mockResolvedValue(null),
    });

    const result = await service.curateMessage({
      message: mockMessage,
      curator: { id: 'curator-fail', tag: 'Curator#0000' },
      targetChannel,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');

    const db = getDatabase();
    const curatedMsg = db.prepare('SELECT status FROM curated_messages WHERE message_id = ?').get('message-failure');
    expect(curatedMsg.status).toBe('FAILED');
  });

  it('deve rejeitar curadoria se todas as URLs já existirem no banco (Deduplicação)', async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const targetChannel = { id: 'channel-dedup', send: mockSend };
    const mockMessage = {
      id: 'msg-dedup-test',
      content: 'Veja https://react.dev novamente',
      channelId: 'channel-1',
      createdAt: new Date(),
    };

    const service = new CuratorService({
      findExistingUrls: vi.fn().mockReturnValue([{ url: 'https://react.dev' }]),
      extractSafeUrls: vi.fn().mockResolvedValue(['https://react.dev']),
    });

    const result = await service.curateMessage({
      message: mockMessage,
      curator: { id: 'curator-x', tag: 'CuratorX' },
      targetChannel,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('URLS_ALREADY_CURATED');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('deve criar thread de discussão automática quando ativado', async () => {
    const mockStartThread = vi.fn().mockResolvedValue({});
    const mockSend = vi.fn().mockResolvedValue({
      id: 'sent-msg-id',
      startThread: mockStartThread,
    });

    const targetChannel = { id: 'channel-thread', send: mockSend };
    const mockMessage = {
      id: 'msg-thread-test',
      content: 'Artigo novo: https://github.com/nodejs/node',
      channelId: 'channel-1',
      createdAt: new Date(),
      author: { tag: 'Author#0001', displayAvatarURL: () => 'avatar.png' },
    };

    const service = new CuratorService({
      claimMessage: claimMessageForCuration,
      markCompleted: markMessageCompleted,
      markFailed: markMessageFailed,
      extractSafeUrls: vi.fn().mockResolvedValue(['https://github.com/nodejs/node']),
      extractMetadata: vi.fn().mockResolvedValue({ title: 'Node.js Core Repo' }),
      autoCreateThreads: true,
    });

    const result = await service.curateMessage({
      message: mockMessage,
      curator: { id: 'curator-thread', tag: 'CuratorThread#0001' },
      targetChannel,
      emoji: '💻',
    });

    expect(result.success).toBe(true);
    expect(mockStartThread).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('Node.js Core Repo'),
      })
    );
  });
});

