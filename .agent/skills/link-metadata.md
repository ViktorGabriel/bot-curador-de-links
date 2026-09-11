---
name: link-metadata
description: Implementa extração de OpenGraph (título, imagem e descrição de páginas web) para embeds do Discord
---

# Diretrizes de Implementação

Ao expandir a captura de URLs:

1. Adicione a biblioteca `open-graph-scraper` ou use `fetch` nativo com parse HTML leve.
2. Extraia: `og:title`, `og:description`, `og:image` e `favicon`.
3. Trate timeouts (máximo 3 segundos) para evitar que o bot trave em URLs lentas.
4. Ajuste o `EmbedBuilder` para renderizar o thumbnail e o título do artigo no Discord.
