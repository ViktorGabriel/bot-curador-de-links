import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDatabase,
  claimMessageForCuration,
  markMessageCompleted,
  markMessageFailed,
  isMessageSaved,
  closeDatabase,
  getDatabase,
  findExistingUrls,
  searchLinks,
  getRecentLinks,
  getLinksStats,
  getAllLinksForExport,
} from '../../src/services/database.js';

describe('Database Service & Concurrency Lock', () => {
  beforeEach(() => {
    closeDatabase();
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
  });

  it('deve obter reserva atômica para uma mensagem e rejeitar execuções concorrentes', () => {
    const payload = {
      messageId: '123456789012345678',
      curatorId: '987654321098765432',
      channelId: '112233445566778899',
      createdAt: new Date(),
    };

    // Primeira tentativa (requisição A)
    const claimedFirst = claimMessageForCuration(payload);
    expect(claimedFirst).toBe(true);

    // Segunda tentativa simultânea (requisição B para mesma mensagem)
    const claimedSecond = claimMessageForCuration(payload);
    expect(claimedSecond).toBe(false);

    // isMessageSaved deve retornar true
    expect(isMessageSaved(payload.messageId)).toBe(true);
  });

  it('deve completar a curadoria em transação e persistir os links com metadados e categoria', () => {
    const payload = {
      messageId: '123456789012345678',
      curatorId: '987654321098765432',
      channelId: '112233445566778899',
      createdAt: new Date(),
    };

    claimMessageForCuration(payload);

    const urls = ['https://github.com', 'https://vitest.dev'];
    markMessageCompleted({
      messageId: payload.messageId,
      urls,
      metadata: { title: 'Repositório de Teste', description: 'Descrição legal' },
      category: 'dev',
      authorId: '111222333',
    });

    const db = getDatabase();
    const message = db.prepare('SELECT status FROM curated_messages WHERE message_id = ?').get(payload.messageId);
    expect(message.status).toBe('COMPLETED');

    const savedLinks = db.prepare('SELECT * FROM saved_links WHERE message_id = ?').all(payload.messageId);
    expect(savedLinks).toHaveLength(2);
    expect(savedLinks.map((l) => l.url)).toEqual(urls);
    expect(savedLinks[0].category).toBe('dev');
    expect(savedLinks[0].title).toBe('Repositório de Teste');
    expect(savedLinks[0].author_id).toBe('111222333');
  });

  it('deve marcar o status como FAILED se a curadoria falhar', () => {
    const payload = {
      messageId: '123456789012345678',
      curatorId: '987654321098765432',
      channelId: '112233445566778899',
    };

    claimMessageForCuration(payload);
    markMessageFailed(payload.messageId);

    const db = getDatabase();
    const message = db.prepare('SELECT status FROM curated_messages WHERE message_id = ?').get(payload.messageId);
    expect(message.status).toBe('FAILED');
  });

  it('deve localizar URLs existentes para deduplicação inteligente', () => {
    const payload = {
      messageId: 'msg-dedup-1',
      curatorId: 'curator-1',
      channelId: 'channel-1',
    };
    claimMessageForCuration(payload);
    markMessageCompleted({
      messageId: payload.messageId,
      urls: ['https://example.com/unique-link'],
      category: 'reading',
    });

    const existing = findExistingUrls(['https://example.com/unique-link', 'https://example.com/new-link']);
    expect(existing).toHaveLength(1);
    expect(existing[0].url).toBe('https://example.com/unique-link');
  });

  it('deve pesquisar links por texto e categoria', () => {
    claimMessageForCuration({ messageId: 'msg-search-1', curatorId: 'c1', channelId: 'ch1' });
    markMessageCompleted({
      messageId: 'msg-search-1',
      urls: ['https://react.dev'],
      metadata: { title: 'React Documentation', description: 'The library for web UIs' },
      category: 'dev',
    });

    claimMessageForCuration({ messageId: 'msg-search-2', curatorId: 'c2', channelId: 'ch1' });
    markMessageCompleted({
      messageId: 'msg-search-2',
      urls: ['https://figma.com'],
      metadata: { title: 'Figma Design Tool', description: 'Collaborative interface design' },
      category: 'design',
    });

    const searchResults = searchLinks({ query: 'React' });
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].title).toBe('React Documentation');

    const filteredResults = searchLinks({ query: 'design', category: 'design' });
    expect(filteredResults).toHaveLength(1);
    expect(filteredResults[0].category).toBe('design');
  });

  it('deve retornar links recentes e estatísticas agregadas', () => {
    claimMessageForCuration({ messageId: 'msg-stats-1', curatorId: 'curator-top', channelId: 'ch1' });
    markMessageCompleted({
      messageId: 'msg-stats-1',
      urls: ['https://link1.com'],
      category: 'dev',
    });

    claimMessageForCuration({ messageId: 'msg-stats-2', curatorId: 'curator-top', channelId: 'ch1' });
    markMessageCompleted({
      messageId: 'msg-stats-2',
      urls: ['https://link2.com'],
      category: 'video',
    });

    const recent = getRecentLinks({ limit: 5 });
    expect(recent).toHaveLength(2);

    const stats = getLinksStats();
    expect(stats.totalLinks).toBe(2);
    expect(stats.totalCuratedMessages).toBe(2);
    expect(stats.categoryCounts.dev).toBe(1);
    expect(stats.categoryCounts.video).toBe(1);
    expect(stats.topCurators[0].curator_id).toBe('curator-top');
    expect(stats.topCurators[0].count).toBe(2);

    const exportData = getAllLinksForExport();
    expect(exportData).toHaveLength(2);
  });
});
