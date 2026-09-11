---
name: link-metadata-scraper
description: Regras para scraping leve via open-graph-scraper ou fetch para enriquecer embeds com título da página, descrição e imagem de capa com timeout de 3 segundos.
---

# Diretrizes para Extração de Metadados de Links (OpenGraph Scraper)

Esta skill estabelece o padrão para extração performática e segura de metadados de URLs para enriquecer embeds de curadoria no Discord.

## Requisitos Obrigatórios

1. **Timeout Estrito de 3 Segundos**:
   - Todo scraping de página externa deve respeitar um limite máximo de 3 segundos (3000ms).
   - URLs lentas, com certificado problemático ou inacessíveis não podem bloquear nem atrasar a fila de processamento do bot.

2. **Atributos Essenciais Extraídos**:
   - `og:title` / `title`: Título do artigo ou página web (truncado se exceder o limite de 256 caracteres do Discord).
   - `og:description`: Resumo ou descrição do artigo (formatado e limitado a 300 caracteres).
   - `og:image`: Imagem de capa principal do artigo (renderizada como thumbnail ou imagem destacada).
   - `favicon`: Ícone do site para atribuição no footer/thumbnail secundário.
   - `og:site_name`: Nome da fonte jornalística/portal para exibição no rodapé.

3. **Validação e Sanitização de URLs**:
   - Aceitar apenas links com esquemas válidos `http:` ou `https:`.
   - Resolver caminhos relativos em imagens ou favicons contra a URL base antes de repassar ao Discord.

4. **Resiliência e Fallback Transparente**:
   - Caso o scraping falhe, resulte em erro HTTP ou estoure o timeout de 3 segundos, o bot deve capturar a exceção com segurança e retornar um objeto nulo ou básico sem interromper a postagem do link original.
