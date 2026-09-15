/**
 * Definição centralizada de categorias, paleta de cores e emojis correspondentes.
 */
export const CATEGORIES = {
  dev: {
    key: 'dev',
    label: 'Dev & Código',
    emoji: '💻',
    color: 0x2ecc71, // Verde esmeralda
  },
  design: {
    key: 'design',
    label: 'Design & UI/UX',
    emoji: '🎨',
    color: 0xe91e63, // Rosa / Magenta
  },
  reading: {
    key: 'reading',
    label: 'Artigos & Leitura',
    emoji: '📚',
    color: 0x3498db, // Azul
  },
  video: {
    key: 'video',
    label: 'Vídeos & Aulas',
    emoji: '🎥',
    color: 0xe74c3c, // Vermelho
  },
  general: {
    key: 'general',
    label: 'Geral & Curadoria',
    emoji: '📌',
    color: 0x5865f2, // Discord Blurple
  },
};

/**
 * Emojis suportados nativamente como gatilho de curadoria temática.
 */
export const EMOJI_TO_CATEGORY = {
  '💻': 'dev',
  '🎨': 'design',
  '📚': 'reading',
  '🎥': 'video',
  '📌': 'general',
};

/**
 * Heurísticas de domínio para classificação automática quando o emoji for o geral.
 */
const DOMAIN_CATEGORY_RULES = [
  { pattern: /(?:github\.com|gitlab\.com|stackoverflow\.com|npmjs\.com|dev\.to|hashnode\.com)/i, category: 'dev' },
  { pattern: /(?:figma\.com|dribbble\.com|behance\.net)/i, category: 'design' },
  { pattern: /(?:youtube\.com|youtu\.be|vimeo\.com|twitch\.tv)/i, category: 'video' },
  { pattern: /(?:medium\.com|substack\.com|wikipedia\.org|devblogs\.)/i, category: 'reading' },
];

/**
 * Retorna as configurações completas de uma categoria.
 * @param {string} [categoryKey='general']
 * @returns {typeof CATEGORIES['general']}
 */
export function getCategoryConfig(categoryKey = 'general') {
  return CATEGORIES[categoryKey] || CATEGORIES.general;
}

/**
 * Resolve a categoria a partir do emoji da reação.
 * @param {string} emojiName
 * @returns {string|null}
 */
export function resolveCategoryByEmoji(emojiName) {
  if (!emojiName) return null;
  return EMOJI_TO_CATEGORY[emojiName] || null;
}

/**
 * Resolve a categoria a partir de heurísticas no domínio da URL.
 * @param {string} url
 * @returns {string}
 */
export function resolveCategoryByUrl(url) {
  if (!url || typeof url !== 'string') return 'general';

  for (const rule of DOMAIN_CATEGORY_RULES) {
    if (rule.pattern.test(url)) {
      return rule.category;
    }
  }

  return 'general';
}

/**
 * Determina a categoria final combinando emoji da reação e heurística de URL.
 * Se o emoji for temático (ex: 💻), tem prioridade total.
 * Se o emoji for genérico (📌), tenta inferir pela URL antes de usar 'general'.
 *
 * @param {Object} params
 * @param {string} [params.emoji]
 * @param {string} [params.url]
 * @param {string} [params.defaultTriggerEmoji]
 * @returns {typeof CATEGORIES['general']}
 */
export function determineCategory({ emoji, url, defaultTriggerEmoji = '📌' }) {
  const categoryByEmoji = resolveCategoryByEmoji(emoji);

  if (categoryByEmoji && categoryByEmoji !== 'general') {
    return getCategoryConfig(categoryByEmoji);
  }

  // Se foi o emoji padrão ou geral, tenta detectar pelo domínio
  if (emoji === defaultTriggerEmoji || categoryByEmoji === 'general') {
    const categoryByDomain = resolveCategoryByUrl(url);
    return getCategoryConfig(categoryByDomain);
  }

  return getCategoryConfig('general');
}
