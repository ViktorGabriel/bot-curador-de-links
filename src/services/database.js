import Database from 'better-sqlite3';

const db = new Database('database.sqlite');

// Ativa WAL para melhor performance e concorrência
db.pragma('journal_mode = WAL');

// Inicializa a tabela de persistência conforme especificação
db.exec(`
  CREATE TABLE IF NOT EXISTS saved_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    url TEXT,
    user_id TEXT,
    channel_id TEXT,
    created_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_saved_links_message_id ON saved_links(message_id);
  CREATE INDEX IF NOT EXISTS idx_saved_links_url ON saved_links(url);
`);

const checkSavedStmt = db.prepare('SELECT 1 FROM saved_links WHERE message_id = ? LIMIT 1');
const insertSavedLinkStmt = db.prepare(`
  INSERT INTO saved_links (message_id, url, user_id, channel_id, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

/**
 * Consulta se uma mensagem já foi salva previamente no banco de dados.
 * @param {string} messageId
 * @returns {boolean}
 */
export function isMessageSaved(messageId) {
  return !!checkSavedStmt.get(messageId);
}

/**
 * Persiste um link curado no banco de dados.
 * @param {Object} data
 * @param {string} data.messageId
 * @param {string} data.url
 * @param {string} data.userId
 * @param {string} data.channelId
 * @param {Date|string} data.createdAt
 */
export function saveLink({ messageId, url, userId, channelId, createdAt }) {
  const dateStr = createdAt instanceof Date ? createdAt.toISOString() : (createdAt || new Date().toISOString());
  insertSavedLinkStmt.run(messageId, url, userId, channelId, dateStr);
}

export default db;
