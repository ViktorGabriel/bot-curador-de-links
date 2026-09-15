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
      title TEXT,
      description TEXT,
      category TEXT DEFAULT 'general',
      author_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES curated_messages(message_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_saved_links_message_id ON saved_links(message_id);
    CREATE INDEX IF NOT EXISTS idx_saved_links_url ON saved_links(url);
    CREATE INDEX IF NOT EXISTS idx_saved_links_category ON saved_links(category);
    CREATE INDEX IF NOT EXISTS idx_saved_links_created_at ON saved_links(created_at);
  `);

  // Migração incremental de colunas para saved_links se já existir schema anterior
  try {
    const columns = db.prepare('PRAGMA table_info(saved_links)').all();
    const columnNames = new Set(columns.map((col) => col.name));

    if (!columnNames.has('title')) {
      db.exec('ALTER TABLE saved_links ADD COLUMN title TEXT');
    }
    if (!columnNames.has('description')) {
      db.exec('ALTER TABLE saved_links ADD COLUMN description TEXT');
    }
    if (!columnNames.has('category')) {
      db.exec("ALTER TABLE saved_links ADD COLUMN category TEXT DEFAULT 'general'");
    }
    if (!columnNames.has('author_id')) {
      db.exec('ALTER TABLE saved_links ADD COLUMN author_id TEXT');
    }

    // Migração de dados legados se existirem (ex: colunas user_id na raiz)
    if (columnNames.has('user_id')) {
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
 * Finaliza a curadoria com sucesso em transação atômica, salvando os links e metadados.
 *
 * @param {Object} params
 * @param {string} params.messageId
 * @param {string[]} params.urls
 * @param {Object} [params.metadata]
 * @param {string} [params.category='general']
 * @param {string} [params.authorId]
 */
export function markMessageCompleted({
  messageId,
  urls,
  metadata = null,
  category = 'general',
  authorId = null,
}) {
  const db = getDatabase();
  const now = new Date().toISOString();

  const updateStatus = db.prepare(`
    UPDATE curated_messages
    SET status = 'COMPLETED', updated_at = ?
    WHERE message_id = ?
  `);

  const insertLink = db.prepare(`
    INSERT INTO saved_links (message_id, url, title, description, category, author_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    updateStatus.run(now, messageId);
    const title = metadata?.title || null;
    const description = metadata?.description || null;

    for (const url of urls) {
      insertLink.run(messageId, url, title, description, category, authorId, now);
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
 * Localiza links já cadastrados na base a partir de uma lista de URLs.
 * Usado para deduplicação inteligente.
 *
 * @param {string[]} urls
 * @returns {Array<{ id: number, message_id: string, url: string, title: string|null, created_at: string }>}
 */
export function findExistingUrls(urls) {
  if (!urls || urls.length === 0) return [];
  const db = getDatabase();

  const placeholders = urls.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT id, message_id, url, title, created_at
    FROM saved_links
    WHERE url IN (${placeholders})
  `);

  return stmt.all(...urls);
}

/**
 * Realiza busca textual em links salvos.
 *
 * @param {Object} params
 * @param {string} params.query
 * @param {string} [params.category]
 * @param {number} [params.limit=10]
 * @param {number} [params.offset=0]
 * @returns {Array<Object>}
 */
export function searchLinks({ query, category, limit = 10, offset = 0 }) {
  const db = getDatabase();
  const searchPattern = `%${query.trim()}%`;

  if (category && category !== 'all') {
    const stmt = db.prepare(`
      SELECT sl.*, cm.curator_id, cm.channel_id
      FROM saved_links sl
      JOIN curated_messages cm ON sl.message_id = cm.message_id
      WHERE (sl.title LIKE ? OR sl.description LIKE ? OR sl.url LIKE ?)
        AND sl.category = ?
      ORDER BY sl.created_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(searchPattern, searchPattern, searchPattern, category, limit, offset);
  }

  const stmt = db.prepare(`
    SELECT sl.*, cm.curator_id, cm.channel_id
    FROM saved_links sl
    JOIN curated_messages cm ON sl.message_id = cm.message_id
    WHERE sl.title LIKE ? OR sl.description LIKE ? OR sl.url LIKE ?
    ORDER BY sl.created_at DESC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(searchPattern, searchPattern, searchPattern, limit, offset);
}

/**
 * Retorna os links curados mais recentes.
 *
 * @param {Object} [params]
 * @param {number} [params.limit=10]
 * @param {string} [params.category]
 * @returns {Array<Object>}
 */
export function getRecentLinks({ limit = 10, category = null } = {}) {
  const db = getDatabase();

  if (category && category !== 'all') {
    const stmt = db.prepare(`
      SELECT sl.*, cm.curator_id, cm.channel_id
      FROM saved_links sl
      JOIN curated_messages cm ON sl.message_id = cm.message_id
      WHERE sl.category = ?
      ORDER BY sl.created_at DESC
      LIMIT ?
    `);
    return stmt.all(category, limit);
  }

  const stmt = db.prepare(`
    SELECT sl.*, cm.curator_id, cm.channel_id
    FROM saved_links sl
    JOIN curated_messages cm ON sl.message_id = cm.message_id
    ORDER BY sl.created_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

/**
 * Retorna estatísticas agregadas sobre links e curadores.
 *
 * @returns {{ totalLinks: number, totalCuratedMessages: number, categoryCounts: Record<string, number>, topCurators: Array<{ curator_id: string, count: number }> }}
 */
export function getLinksStats() {
  const db = getDatabase();

  const totalLinksRow = db.prepare('SELECT COUNT(*) as count FROM saved_links').get();
  const totalMessagesRow = db.prepare("SELECT COUNT(*) as count FROM curated_messages WHERE status = 'COMPLETED'").get();

  const categoryRows = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM saved_links
    GROUP BY category
    ORDER BY count DESC
  `).all();

  const categoryCounts = {};
  for (const row of categoryRows) {
    categoryCounts[row.category || 'general'] = row.count;
  }

  const topCurators = db.prepare(`
    SELECT curator_id, COUNT(*) as count
    FROM curated_messages
    WHERE status = 'COMPLETED'
    GROUP BY curator_id
    ORDER BY count DESC
    LIMIT 5
  `).all();

  return {
    totalLinks: totalLinksRow?.count || 0,
    totalCuratedMessages: totalMessagesRow?.count || 0,
    categoryCounts,
    topCurators,
  };
}

/**
 * Retorna todos os links curados para exportação.
 *
 * @returns {Array<Object>}
 */
export function getAllLinksForExport() {
  const db = getDatabase();
  return db.prepare(`
    SELECT sl.*, cm.curator_id, cm.channel_id
    FROM saved_links sl
    JOIN curated_messages cm ON sl.message_id = cm.message_id
    ORDER BY sl.created_at DESC
  `).all();
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
  findExistingUrls,
  searchLinks,
  getRecentLinks,
  getLinksStats,
  getAllLinksForExport,
  closeDatabase,
};
