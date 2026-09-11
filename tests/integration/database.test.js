import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDatabase,
  claimMessageForCuration,
  markMessageCompleted,
  markMessageFailed,
  isMessageSaved,
  closeDatabase,
  getDatabase,
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

  it('deve completar a curadoria em transação e persistir os links', () => {
    const payload = {
      messageId: '123456789012345678',
      curatorId: '987654321098765432',
      channelId: '112233445566778899',
      createdAt: new Date(),
    };

    claimMessageForCuration(payload);

    const urls = ['https://github.com', 'https://vitest.dev'];
    markMessageCompleted({ messageId: payload.messageId, urls });

    const db = getDatabase();
    const message = db.prepare('SELECT status FROM curated_messages WHERE message_id = ?').get(payload.messageId);
    expect(message.status).toBe('COMPLETED');

    const savedLinks = db.prepare('SELECT url FROM saved_links WHERE message_id = ?').all(payload.messageId);
    expect(savedLinks).toHaveLength(2);
    expect(savedLinks.map((l) => l.url)).toEqual(urls);
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
});
