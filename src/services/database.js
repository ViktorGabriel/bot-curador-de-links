import Database from 'better-sqlite3';

let currentDb = null;

/**
 * Inicializa a conexão com o banco SQLite e garante a criação do schema e migrações necessárias.
 * @param {string} [dbPath='database.sqlite']
 * @returns {import('better-sqlite3').Database}
 */
export function initDatabase(dbPath = 'database.sqlite') {
  if (currentDb) {
    return currentDb;
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Cria tabela de mensagens curadas para reserva e integridade atômica
  db.exec(`
    CREATE TABLE IF NOT EXISTS curated_messages (
      message_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
      curator_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES curated_messages(message_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_saved_links_message_id ON saved_links(message_id);
    CREATE INDEX IF NOT EXISTS idx_saved_links_url ON saved_links(url);
  `);

  // Migração de dados legados se existirem
  try {
    const legacyColumns = db.prepare("PRAGMA table_info(saved_links)").all();
    const hasUserId = legacyColumns.some((col) => col.name === 'user_id');
    if (hasUserId) {
      // Migra registros legados para curated_messages
      const legacyRows = db.prepare('SELECT DISTINCT message_id, user_id, channel_id, created_at FROM saved_links WHERE message_id NOT IN (SELECT message_id FROM curated_messages)').all();
      const now = new Date().toISOString();
      const insertCurated = db.prepare(`
        INSERT OR IGNORE INTO curated_messages (message_id, status, curator_id, channel_id, created_at, updated_at)
        VALUES (?, 'COMPLETED', ?, ?, ?, ?)
      `);
      for (const row of legacyRows) {
        insertCurated.run(row.message_id, row.user_id || 'unknown', row.channel_id || 'unknown', row.created_at || now, now);
      }
    }
  } catch {
    // Ignora se tabela acabou de ser criada
  }

  currentDb = db;
  return currentDb;
}

/**
 * Retorna a instância ativa do banco ou a inicializa com o caminho padrão.
 * @returns {import('better-sqlite3').Database}
 */
export function getDatabase() {
  if (!currentDb) {
    return initDatabase(process.env.DATABASE_PATH || 'database.sqlite');
  }
  return currentDb;
}

/**
 * Tenta reservar atomicamente a mensagem para curadoria (Padrão Reservation / Lock).
 * Se dois eventos concorrentes tentarem curar a mesma mensagem, apenas um terá sucesso.
 *
 * @param {Object} params
 * @param {string} params.messageId
 * @param {string} params.curatorId
 * @param {string} params.channelId
 * @param {Date|string} [params.createdAt]
 * @returns {boolean} True se a reserva foi obtida com sucesso; False se a mensagem já foi processada ou está em processamento.
 */
export function claimMessageForCuration({ messageId, curatorId, channelId, createdAt }) {
  const db = getDatabase();
  const dateStr = createdAt instanceof Date ? createdAt.toISOString() : (createdAt || new Date().toISOString());

  try {
    const stmt = db.prepare(`
      INSERT INTO curated_messages (message_id, status, curator_id, channel_id, created_at, updated_at)
      VALUES (?, 'PROCESSING', ?, ?, ?, ?)
    `);
    const result = stmt.run(messageId, curatorId, channelId, dateStr, dateStr);
    return result.changes > 0;
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || (err.message && err.message.includes('UNIQUE constraint failed'))) {
      return false;
    }
    throw err;
  }
}

/**
 * Finaliza a curadoria com sucesso em transação atômica.
 *
 * @param {Object} params
 * @param {string} params.messageId
 * @param {string[]} params.urls
 */
export function markMessageCompleted({ messageId, urls }) {
  const db = getDatabase();
  const now = new Date().toISOString();

  const updateStatus = db.prepare(`
    UPDATE curated_messages
    SET status = 'COMPLETED', updated_at = ?
    WHERE message_id = ?
  `);

  const insertLink = db.prepare(`
    INSERT INTO saved_links (message_id, url, created_at)
    VALUES (?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    updateStatus.run(now, messageId);
    for (const url of urls) {
      insertLink.run(messageId, url, now);
    }
  });

  transaction();
}

/**
 * Marca o status da mensagem como falha em caso de erro irreparável.
 *
 * @param {string} messageId
 */
export function markMessageFailed(messageId) {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE curated_messages
    SET status = 'FAILED', updated_at = ?
    WHERE message_id = ?
  `).run(now, messageId);
}

/**
 * Verifica se a mensagem já foi processada ou está reservada.
 * @param {string} messageId
 * @returns {boolean}
 */
export function isMessageSaved(messageId) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT status FROM curated_messages WHERE message_id = ? LIMIT 1
  `).get(messageId);

  return !!row;
}

/**
 * Fecha graciosamente a conexão com o banco de dados.
 */
export function closeDatabase() {
  if (currentDb) {
    try {
      currentDb.close();
    } catch {
      // Já fechado ou erro de desalocação
    }
    currentDb = null;
  }
}

export default {
  initDatabase,
  getDatabase,
  claimMessageForCuration,
  markMessageCompleted,
  markMessageFailed,
  isMessageSaved,
  closeDatabase,
};
