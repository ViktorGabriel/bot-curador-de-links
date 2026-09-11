---
name: node-modular-refactor
description: Regras para desacoplar bots de Discord dividindo em pastas src/commands, src/events, src/handlers e separando regras de negócios em services.
---

# Padrão de Refatoração Modular para Bots Discord (Node.js ESM)

Esta skill estabelece a arquitetura modular limpa e escalável para aplicações de bots Discord em Node.js com ES Modules.

## Estrutura de Diretórios Obrigatória

```text
src/
├── commands/            # Comandos executáveis pelo bot (Slash commands / prefixo)
├── events/              # Listeners de eventos do Discord (ready, messageReactionAdd, etc.)
├── handlers/            # Loaders responsáveis por carregar e registrar eventos/comandos
├── services/            # Lógica de negócio, banco de dados e APIs externas desacopladas do Discord
└── utils/               # Formatadores, builders de Embeds e funções utilitárias puras
index.js                 # Ponto de entrada mínimo: instancia Client, dispara handlers e login
```

## Diretrizes de Cada Camada

### 1. `src/events/` (Eventos do Discord)
- Cada evento do Discord deve residir em seu próprio arquivo isolado.
- Deve exportar um objeto com a assinatura:
  ```javascript
  export default {
    name: 'nomeDoEvento', // ex: 'clientReady', 'messageReactionAdd'
    once: false,          // boolean (true para clientReady)
    async execute(param1, param2, ..., client) {
      // orquestração do evento
    }
  };
  ```
- **Regra de Ouro**: O evento NUNCA deve conter consultas diretas SQL brutas nem scraping inline; ele delega imediatamente para a camada de `services/`.

### 2. `src/handlers/` (Carregadores Automáticos)
- Responsável por ler o diretório `src/events/` e registrar cada ouvinte dinamicamente no `client` (`client.once` ou `client.on`).
- Facilita a adição de novos eventos sem a necessidade de editar o `index.js`.

### 3. `src/services/` (Lógica de Negócios e Infraestrutura)
- Módulos independentes do Discord (podem ser testados unitariamente sem instanciar bot).
- Exemplos:
  - `database.js`: Operações de persistência com SQLite (prepares, transações, queries).
  - `metadataScraper.js`: Comunicação com serviços de scraping ou requisições HTTP externas.

### 4. `src/utils/` (Apresentação e Auxiliares)
- Criação e estilização de embeds Discord (`EmbedBuilder`), parsing de textos, regexes globais.

### 5. `index.js` (Entrypoint Limpo)
- Apenas inicializa as variáveis de ambiente, instancia o `Client` com intents e partials, invoca o loader de handlers e executa `client.login()`.
