import ogs from 'open-graph-scraper';

/**
 * Extrai metadados OpenGraph (título, descrição, imagem e favicon) de uma URL.
 * Possui timeout de 3 segundos para evitar que requisições lentas travem o bot.
 * 
 * @param {string} url 
 * @returns {Promise<{title: string|null, description: string|null, image: string|null, favicon: string|null, siteName: string|null}|null>}
 */
export async function extractLinkMetadata(url) {
  try {
    const { result, error } = await ogs({
      url,
      timeout: 3, // 3 segundos de timeout
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

    // Normaliza URL relativa de imagem se necessário
    if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      try {
        imageUrl = new URL(imageUrl, url).href;
      } catch {
        imageUrl = null;
      }
    }

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
      image: imageUrl,
      favicon: favicon,
      siteName: result.ogSiteName || null,
    };
  } catch (err) {
    console.warn(`[OpenGraph] Não foi possível extrair metadados para ${url}:`, err.message || err);
    return null;
  }
}
