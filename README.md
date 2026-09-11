# 🤖 Bot Curador de Links (Discord Link Curator)

Aplicação backend robusta em **Node.js (ESM)** para curadoria e arquivamento automatizado de links no Discord. Projetada com padrões arquiteturais de nível de produção: eliminação de condições de corrida via reservas atômicas, blindagem contra **SSRF**, observabilidade estruturada e alta testabilidade com suíte automatizada em **Vitest**.

---

## 🎯 Arquitetura & Engenharia do Sistema

A base de código foi estruturada seguindo o princípio da responsabilidade única (SRP) e desacoplamento de transporte:

```text
├── src/
│   ├── config/              # Schemas e validação estrita de ambiente (Zod)
│   ├── events/              # Adapters de Gateway Discord (Event Handlers finos)
│   ├── handlers/            # Dynamic Event & Command Loader
│   ├── services/            # Casos de Uso (CuratorService) e Infra (SQLite, Scraper)
│   └── utils/               # Logger estruturado (Pino), URL Validator (SSRF), Embeds
├── tests/
│   ├── integration/         # Testes de concorrência SQLite e fluxo sem Discord
│   └── unit/                # Testes de SSRF, validação de schema e Embeds
├── index.js                 # Entrypoint com Graceful Shutdown e Lifecycle management
└── database.sqlite          # SQLite WAL persistente (produção/desenvolvimento)
```

### 1. Prevenção de Race Conditions (Padrão Reservation / Lock)
Em ambientes com alta concorrência de reações, múltiplos usuários podem reagir simultaneamente à mesma mensagem.
- **Mecanismo:** Antes de disparar operações de I/O de rede (OpenGraph Scraping ou publicação no Discord), o serviço executa `claimMessageForCuration(...)` inserindo um registro na tabela `curated_messages` com `status = 'PROCESSING'` e restrição `PRIMARY KEY (message_id)`.
- **Garantia:** Apenas uma execução obtém o lock atômico. Todas as requisições concorrentes são descartadas sem duplicar envios nem onerar a API do Discord. A finalização e inserção dos links ocorrem dentro de uma transação atômica (`db.transaction`).

### 2. Blindagem de Segurança (Mitigação de SSRF & Zod)
- **Anti-SSRF (Server-Side Request Forgery):** Antes de qualquer requisição externa para extração de metadados, o módulo `urlValidator.js` resolve os registros DNS do hostname e valida cada endereço retornado via `ipaddr.js`. Endereços de loopback (`127.0.0.0/8`, `::1`), redes privadas (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Carrier-grade NAT (`100.64.0.0/10`) e metadados de nuvem (`169.254.169.254`) são sumariamente bloqueados.
- **Validação de Schema:** Todas as variáveis de ambiente são validadas na inicialização com **Zod**, garantindo que Snowflakes do Discord sejam válidos e rejeitando execuções com credenciais malformadas.
- **Proteção contra Menções em Massa:** Todas as mensagens enviadas ao Discord utilizam `allowedMentions: { parse: [] }`, prevenindo exploração de `@everyone` ou `@here`.

### 3. Observabilidade & Ciclo de Vida do Processo
- **Logs Estruturados:** Utilização do **Pino**, emitindo JSON contextualizado com `messageId`, `curatorId` e `channelId` em produção e formatação legível com `pino-pretty` em desenvolvimento.
- **Graceful Shutdown:** Interceptação dos sinais `SIGINT` e `SIGTERM`. Garante o flush dos logs, encerra graciosamente o cliente Discord Gateway e fecha a conexão SQLite (`db.close()`), prevenindo corrupção do arquivo WAL.
- **Tratamento de Exceções Globais:** Handlers para `unhandledRejection` e `uncaughtException` registram logs com nível fatal antes do encerramento controlado do processo.

### 4. Testabilidade e Isolamento de Domínio
A camada de aplicação `CuratorService` é agnóstica ao cliente Discord.js. Toda a suíte de testes pode ser executada sem conexão com a internet ou credenciais reais, utilizando SQLite em memória (`:memory:`) e mocks controlados.

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
- **SSRF & Segurança:** Bloqueio de IPs privados, loopback, metadados de nuvem e validação de schema Zod.
- **Concorrência & Transações:** Execução paralela simultânea de reações garantindo atomicidade e ausência de duplicatas via SQLite.
- **Isolamento de Domínio:** Fluxo completo do `CuratorService` com mocks de canais Discord e scraping OpenGraph.
- **Embed Builder:** Formatação, higienização e limites estritos de caracteres para o Discord.

---

## 🛠️ Tecnologias & Ferramentas

| Categoria | Tecnologia | Finalidade |
| :--- | :--- | :--- |
| **Runtime** | [Node.js](https://nodejs.org/) (ESM) | Plataforma de execução assíncrona |
| **Discord API** | [discord.js v14](https://discord.js.org/) | Conexão com Discord Gateway e API REST |
| **Persistência** | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Banco relacional com journaling WAL de alta performance |
| **Validação** | [Zod](https://zod.dev/) | Validação de tipos e schemas em runtime |
| **Segurança** | [ipaddr.js](https://github.com/whitequark/ipaddr.js) | Análise e filtragem de blocos de rede (SSRF) |
| **Scraping** | [open-graph-scraper](https://github.com/jshemas/openGraphScraper) | Extração leve de metadados HTML/OGP |
| **Logging** | [Pino](https://getpino.io/) / [pino-pretty](https://github.com/pinojs/pino-pretty) | Logger estruturado de alta performance |
| **Testes** | [Vitest](https://vitest.dev/) | Framework de testes unitários e de integração |

---

## 📄 Licença
Distribuído sob a licença ISC. Desenvolvido por Viktor Gabriel.
