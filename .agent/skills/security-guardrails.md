---
name: security-guardrails
description: Regras obrigatórias de segurança para evitar vazamento de credenciais, logs excessivos e exposição de dados.
---

# Diretrizes Estritas de Segurança

1. **Gestão de Segredos e Variáveis:**
   - NUNCA escreva chaves de API, tokens do Discord ou senhas em arquivos de código (`.js`, `.ts`, `.json`).
   - Use SEMPRE variáveis de ambiente (`process.env.*`).
   - Garanta que `.env` esteja presente e listado no topo do arquivo `.gitignore`.
   - Crie apenas um `.env.example` com valores dummy (ex: `DISCORD_TOKEN=seu_token_aqui`).

2. **Prevenção de Vazamento em Logs:**
   - NUNCA imprima o conteúdo bruto do objeto de configuração ou mensagens com URLs com parâmetros sensíveis no `console.log`.
   - Remova tokens ou dados pessoais (PII) antes de logar erros.

3. **Sanitização e Validação:**
   - Sanitizar URLs antes de salvá-las ou renderizá-las no embed para evitar injeções ou links do protocolo `javascript:`.
   - Nunca expor IDs internos ou mensagens de erro cruas da API para o usuário final no Discord.
