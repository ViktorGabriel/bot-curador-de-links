---
name: sqlite-persistence
description: Adiciona persistência leve com SQLite para rastrear links e evitar duplicatas
---

# Diretrizes

1. Instale e configure `better-sqlite3` ou `prisma` com SQLite.
2. Crie a tabela `saved_links` com colunas: id, message_id, url, user_id, channel_id, created_at.
3. Substitua as verificações em memória por consultas indexadas no banco local.
