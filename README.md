# 🤖 Bot Curador de Links

Bot para Discord em Node.js (ESM) construído para curadoria automática de links e notícias através de reações com emojis. Inclui persistência local via SQLite e enriquecimento visual automático de metadados OpenGraph com timeout resiliente.

## ✨ Funcionalidades

- **Curadoria por Reação**: Detecta a reação configurada (`TRIGGER_EMOJI`) em mensagens contendo links e as repassa para um canal central de notícias (`TARGET_CHANNEL_ID`).
- **Extração de Metadados OpenGraph**: Scraping leve de páginas web extraindo título (`og:title`), descrição (`og:description`), imagem de capa (`og:image`), favicon e nome do portal com timeout de 3 segundos.
- **Persistência SQLite**: Registro indexado na tabela `saved_links` com `better-sqlite3` para evitar republicação e duplicatas de links e mensagens.
- **Arquitetura Modular**: Desacoplamento estrito em camadas (`src/events`, `src/handlers`, `src/services`, `src/utils` e `src/commands`).

## 📁 Estrutura do Projeto

```text
├── .agents/skills/          # Skills Antigravity / Agentic standards
├── src/
│   ├── commands/            # Comandos Slash / prefixo
│   ├── events/              # Eventos do Discord (ready, messageReactionAdd)
│   ├── handlers/            # Carregadores dinâmicos de eventos e comandos
│   ├── services/            # Serviços independentes (SQLite, OpenGraph Scraper)
│   └── utils/               # Construtores de Embeds e utilitários
├── index.js                 # Entrypoint limpo da aplicação
├── package.json
└── database.sqlite          # Banco local SQLite (gerado automaticamente)
```

## 🚀 Instalação e Execução

1. Clone o repositório:
```bash
git clone https://github.com/ViktorGabriel/bot-curador-de-links.git
cd bot-curador-de-links
```

2. Instale as dependências:
```bash
npm install
```

3. Crie o arquivo `.env` na raiz do projeto com as variáveis necessárias:
```env
DISCORD_TOKEN=seu_token_aqui
TARGET_CHANNEL_ID=id_do_canal_de_destino
TRIGGER_EMOJI=📌
```

4. Inicie o bot:
```bash
npm start
```

## 🛠️ Tecnologias Utilizadas

- [Node.js](https://nodejs.org/) (ES Modules)
- [Discord.js v14](https://discord.js.org/)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [open-graph-scraper](https://github.com/jshemas/openGraphScraper)
- [dotenv](https://github.com/motdotla/dotenv)
