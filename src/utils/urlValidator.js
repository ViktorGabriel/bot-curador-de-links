import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

// Expressão regular para capturar URLs HTTP/HTTPS em textos
export const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Valida se um IP string pertence a uma faixa privada, reservada, loopback ou link-local.
 * @param {string} ipString
 * @returns {boolean} True se o IP for privado/inseguro para requisições do servidor
 */
export function isPrivateIp(ipString) {
  try {
    let addr = ipaddr.parse(ipString);

    // Se for IPv4 mapeado em IPv6 (::ffff:192.168.1.1), extrai o IPv4
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }

    const range = addr.range();

    // Faixas não permitidas para requisições de backend (SSRF mitigation)
    const dangerousRanges = [
      'loopback',
      'private',
      'linkLocal',
      'carrierGradeNat',
      'broadcast',
      'reserved',
      'unspecified',
      'uniqueLocal',
    ];

    if (dangerousRanges.includes(range)) {
      return true;
    }

    // Bloqueia expressamente o IP de metadados de nuvem da AWS/GCP/Azure
    if (addr.toString() === '169.254.169.254') {
      return true;
    }

    return false;
  } catch {
    return true; // Qualquer IP não analisável é considerado inseguro
  }
}

/**
 * Valida rigorosamente se uma URL é segura contra SSRF (Server-Side Request Forgery).
 * Verifica protocolo, resolve DNS e rejeita alvos locais/privados.
 *
 * @param {string} rawUrl
 * @returns {Promise<{ safe: boolean, url: string | null, reason?: string }>}
 */
export async function isSafePublicUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, url: null, reason: 'URL vazia ou inválida' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, url: null, reason: 'URL com formato malformado' };
  }

  // Apenas esquemas HTTP e HTTPS são permitidos
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, url: null, reason: `Protocolo não permitido: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Rejeita domínios locais óbvios
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return { safe: false, url: null, reason: 'Alvo local/interno proibido' };
  }

  // Se o hostname já for um IP literal
  if (ipaddr.isValid(hostname)) {
    if (isPrivateIp(hostname)) {
      return { safe: false, url: null, reason: 'IP de destino privado ou de loopback proibido (SSRF)' };
    }
    return { safe: true, url: parsed.href };
  }

  // Resolução de DNS para checar os endereços IP vinculados ao hostname
  try {
    const addresses = await dns.lookup(hostname, { all: true });

    if (!addresses || addresses.length === 0) {
      return { safe: false, url: null, reason: 'Domínio não resolvível via DNS' };
    }

    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        return {
          safe: false,
          url: null,
          reason: `Domínio resolve para endereço IP privado (${record.address}) - SSRF bloqueado`,
        };
      }
    }

    return { safe: true, url: parsed.href };
  } catch (err) {
    return { safe: false, url: null, reason: `Falha na resolução de DNS: ${err.message}` };
  }
}

/**
 * Extrai e valida todas as URLs seguras de um texto de mensagem.
 * @param {string} text
 * @returns {Promise<string[]>}
 */
export async function extractSafeUrls(text) {
  if (!text || typeof text !== 'string') return [];

  const rawMatches = text.match(URL_REGEX);
  if (!rawMatches || rawMatches.length === 0) return [];

  const safeUrls = [];
  for (const rawUrl of rawMatches) {
    const result = await isSafePublicUrl(rawUrl);
    if (result.safe && result.url) {
      safeUrls.push(result.url);
    }
  }

  return safeUrls;
}
