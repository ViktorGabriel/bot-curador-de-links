# 🤖 Bot Curador de Links (Discord Link Curator)

Aplicação backend robusta em **Node.js (ESM)** para curadoria, arquivamento automatizado, categorização e pesquisa de links no Discord. Projetada com padrões arquiteturais de nível de produção: eliminação de condições de corrida via reservas atômicas, blindagem contra **SSRF**, categorização contextual, threads automáticas, deduplicação inteligente, Slash Commands (`/links`) e suíte completa de testes automatizados em **Vitest**.

---

## 🎯 Arquitetura & Engenharia do Sistema

A base de código foi estruturada seguindo o princípio da responsabilidade única (SRP) e desacoplamento de transporte:

```text
├── src/
│   ├── commands/            # Slash Commands (/links buscar, recentes, stats, exportar)
│   ├── config/              # Schemas e validação estrita de ambiente (Zod)
│   ├── events/              # Adapters de Gateway Discord (Event Handlers finos)
│   ├── handlers/            # Dynamic Event & Slash Command Loaders
│   ├── services/            # Casos de Uso (CuratorService) e Infra (SQLite, Scraper)
│   └── utils/               # Logger (Pino), URL Validator (SSRF), Categorias, Embeds
├── tests/
│   ├── integration/         # Testes de concorrência SQLite, busca, stats e CuratorService
│   └── unit/                # Testes de SSRF, validação de schema, Embeds, categorias e comandos
├── index.js                 # Entrypoint com Graceful Shutdown e Lifecycle management
└── database.sqlite          # SQLite WAL persistente (produção/desenvolvimento)
```

---

## ✨ Funcionalidades Principais

### 1. 📌 Curadoria Passiva & Categorização Dinâmica
- **Multi-Emoji:** O bot reage tanto ao emoji gatilho configurado (`TRIGGER_EMOJI=📌`) quanto a emojis temáticos:
  - 💻 `💻` $\rightarrow$ **Dev & Código** *(Verde esmeralda)*
  - 🎨 `🎨` $\rightarrow$ **Design & UI/UX** *(Magenta)*
  - 📚 `📚` $\rightarrow$ **Artigos & Leitura** *(Azul)*
  - 🎥 `🎥` $\rightarrow$ **Vídeos & Aulas** *(Vermelho)*
  - 📌 `📌` $\rightarrow$ **Geral & Curadoria** *(Discord Blurple)*
- **Heurística de Domínio:** Se reagido com o emoji geral, o bot analisa o domínio da URL (`github.com`, `figma.com`, `youtube.com`, `medium.com`, etc.) para inferir automaticamente a categoria.

### 2. 🛡️ Deduplicação Inteligente de Links
- Antes de publicar, o `CuratorService` consulta a base SQLite (`findExistingUrls`).
- Se todas as URLs já foram arquivadas anteriormente, o bot evita poluir o canal de destino com postagens repetidas, mantendo a integridade da curadoria.

### 3. 💬 Threads Automáticas de Discussão
- Ao enviar o embed no canal de destino, o bot cria automaticamente uma Thread do Discord vinculada à mensagem (com o título extraído do artigo), incentivando discussões da comunidade sem desorganizar o feed principal.
- Pode ser controlado via variável de ambiente (`AUTO_CREATE_THREADS=true`).

### 4. ⚡ Slash Commands (`/links`)
O bot disponibiliza o comando de barra `/links` com 4 subcomandos:
- `/links buscar termo:[palavra] categoria:[opcional]`: busca textual rápida por título, descrição ou URL com paginação nos embeds.
- `/links recentes limite:[1-10] categoria:[opcional]`: lista os links mais recentes adicionados à base.
- `/links stats`: painel com total de links salvos, mensagens curadas, distribuição por categoria e ranking dos top curadores.
- `/links exportar formato:[markdown | json | csv]`: gera um arquivo para download instantâneo (compatível com Notion, Obsidian e Excel).

---

## 🔒 Segurança e Resiliência

### 1. Prevenção de Race Conditions (Padrão Reservation / Lock)
- **Mecanismo:** Antes de disparar operações de I/O de rede (OpenGraph Scraping ou publicação no Discord), o serviço executa `claimMessageForCuration(...)` inserindo um registro na tabela `curated_messages` com `status = 'PROCESSING'` e restrição `PRIMARY KEY (message_id)`.
- **Garantia:** Apenas uma execução obtém o lock atômico. Todas as requisições concorrentes são descartadas sem duplicar envios nem onerar a API do Discord.

### 2. Blindagem Anti-SSRF (Server-Side Request Forgery)
- Antes de qualquer requisição externa para extração de metadados, o módulo `urlValidator.js` resolve os registros DNS do hostname e valida cada endereço retornado via `ipaddr.js`.
- Endereços de loopback (`127.0.0.0/8`, `::1`), redes privadas (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Carrier-grade NAT (`100.64.0.0/10`) e metadados de nuvem (`169.254.169.254`) são bloqueados.

### 3. Proteção contra Menções em Massa
- Todas as mensagens enviadas ao Discord utilizam `allowedMentions: { parse: [] }`, prevenindo exploração de `@everyone` ou `@here`.

### 4. Observabilidade & Graceful Shutdown
- **Pino:** Logs JSON estruturados com contexto em produção e `pino-pretty` em desenvolvimento.
- **Shutdown Limpo:** Interceptação de `SIGINT` e `SIGTERM` com encerramento gracioso do Gateway Discord e flush seguro do banco SQLite (`db.close()`).

---

## 🚀 Como Executar

### 1. Pré-requisitos
- Node.js `>= 20.x` (testado e homologado em Node.js v24)
- npm `>= 10.x`

### 2. Instalação
```bash
git clone https://github.com/ViktorGabriel/bot-curador-de-links.git
cd bot-curador-de-links
npm install
```

### 3. Configuração de Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto com base no `.env.example`:

```env
# Obrigatórias
DISCORD_TOKEN=seu_token_de_bot_aqui
TARGET_CHANNEL_ID=123456789012345678
TRIGGER_EMOJI=📌

# Opcionais (com defaults pré-configurados)
NODE_ENV=development
LOG_LEVEL=info
DATABASE_PATH=database.sqlite
AUTO_CREATE_THREADS=true
```

### 4. Executando em Desenvolvimento
```bash
npm start
```

---

## 🧪 Suíte de Testes Automatizados

Os testes são executados com **Vitest** cobrindo testes unitários e de integração:

```bash
# Executa todos os testes unitários e de integração
npm test

# Modo assistido (watch mode para desenvolvimento)
npm run test:watch
```

### O que é coberto pelos testes:
- **SSRF & Segurança:** Bloqueio de IPs privados, loopback, metadados de nuvem e validação Zod.
- **Concorrência & Transações:** Execuções paralelas simultâneas garantindo atomicidade via SQLite.
- **Deduplicação & Categorias:** Mapeamento de emojis temáticos, detecção por domínio e rejeição de links duplicados.
- **Embed Builder & Threads:** Formatação visual, higienização de URLs e acionamento de threads.
- **Slash Commands:** Execução de `/links` (buscar, recentes, stats e exportação).

---

## 🛠️ Tecnologias & Ferramentas

| Categoria | Tecnologia | Finalidade |
| :--- | :--- | :--- |
| **Runtime** | [Node.js](https://nodejs.org/) (ESM) | Plataforma de execução assíncrona |
| **Discord API** | [discord.js v14](https://discord.js.org/) | Conexão com Discord Gateway, REST API e Slash Commands |
| **Persistência** | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Banco relacional com journaling WAL de alta performance |
| **Validação** | [Zod](https://zod.dev/) | Validação estrita de schemas em runtime |
| **Segurança** | [ipaddr.js](https://github.com/whitequark/ipaddr.js) | Análise e filtragem de blocos de rede (Anti-SSRF) |
| **Scraping** | [open-graph-scraper](https://github.com/jshemas/openGraphScraper) | Extração resiliente de metadados HTML/OGP |
| **Logging** | [Pino](https://getpino.io/) / [pino-pretty](https://github.com/pinojs/pino-pretty) | Logger estruturado de alta performance |
| **Testes** | [Vitest](https://vitest.dev/) | Framework de testes unitários e de integração |

---

## 📄 Licença
Distribuído sob a licença ISC. Desenvolvido por Viktor Gabriel.
