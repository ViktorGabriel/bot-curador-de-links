import ogs from 'open-graph-scraper';
import { isSafePublicUrl } from '../utils/urlValidator.js';
import logger from '../utils/logger.js';

/**
 * Valida se uma string é uma URL HTTP ou HTTPS válida para o Discord.
 * @param {string|null|undefined} str
 * @returns {boolean}
 */
function isValidHttpUrl(str) {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('http://') || str.startsWith('https://');
}

/**
 * Sanitiza a URL para remoção de query strings ou tokens sensíveis antes de logar.
 * @param {string} rawUrl
 * @returns {string}
 */
function sanitizeUrlForLog(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '[URL não permitida]';
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[URL sanitizada]';
  }
}

/**
 * Realiza scraping leve via OpenGraph com timeout de 3 segundos para enriquecer embeds.
 *
 * @param {string} url - URL do link extraído da mensagem
 * @returns {Promise<{title: string|null, description: string|null, image: string|null, favicon: string|null, siteName: string|null}|null>}
 */
export async function extractLinkMetadata(url) {
  // Blindagem anti-SSRF: valida IP e bloqueia requisições internas antes do fetch
  const safetyCheck = await isSafePublicUrl(url);
  if (!safetyCheck.safe) {
    logger.warn(
      { url: sanitizeUrlForLog(url), reason: safetyCheck.reason },
      'Scraping abortado por política de segurança anti-SSRF.'
    );
    return null;
  }

  try {
    const { result, error } = await ogs({
      url: safetyCheck.url,
      timeout: 3, // Timeout estrito de 3 segundos
    });

    if (error || !result) {
      return null;
    }

    let imageUrl = null;
    if (Array.isArray(result.ogImage) && result.ogImage.length > 0) {
      imageUrl = result.ogImage[0]?.url || null;
    } else if (typeof result.ogImage === 'string') {
      imageUrl = result.ogImage;
    } else if (result.ogImage?.url) {
      imageUrl = result.ogImage.url;
    }

    // Valida e resolve URLs relativas de imagem
    if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      try {
        imageUrl = new URL(imageUrl, url).href;
      } catch {
        imageUrl = null;
      }
    }

    // Valida e resolve favicons relativos
    let favicon = result.favicon || null;
    if (favicon && !favicon.startsWith('http://') && !favicon.startsWith('https://')) {
      try {
        favicon = new URL(favicon, url).href;
      } catch {
        favicon = null;
      }
    }

    return {
      title: result.ogTitle || null,
      description: result.ogDescription || null,
      image: isValidHttpUrl(imageUrl) ? imageUrl : null,
      favicon: isValidHttpUrl(favicon) ? favicon : null,
      siteName: result.ogSiteName || null,
    };
  } catch (err) {
    logger.warn(
      { url: sanitizeUrlForLog(url), err: err.message || err },
      'Falha ao extrair metadados OpenGraph da URL.'
    );
    return null;
  }
}
