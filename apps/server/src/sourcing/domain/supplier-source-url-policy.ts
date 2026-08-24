const SUPPLIER_HOSTS: ReadonlyArray<{
  suffix: string;
  platform: '1688' | 'alibaba';
}> = [
  { suffix: '1688.com', platform: '1688' },
  { suffix: 'alibaba.com', platform: 'alibaba' },
];

/** Shared by business Zod inputs and their Agent-facing JSON Schema catalog. */
export const SUPPLIER_URL_MAX_LENGTH = 2_000;

// JSON Schema patterns have no portable case-insensitive flag. Build the
// host expression from the final parser's suffix allowlist so the catalog
// advertises the same bounded HTTPS boundary without becoming the authority.
const SUPPLIER_ALLOWED_HOST_PATTERN = `(?:[A-Za-z0-9-]+\\.)*(?:${SUPPLIER_HOSTS
  .map(({ suffix }) => suffix.split('.').map(asciiCaseInsensitive).join('\\.'))
  .join('|')})\\.?`;
export const SUPPLIER_URL_CATALOG_PATTERN = `^https:\\/\\/${SUPPLIER_ALLOWED_HOST_PATTERN}(?::443)?(?:[/?#]|$)`;
export const SUPPLIER_URL_CATALOG_REGEXP = new RegExp(SUPPLIER_URL_CATALOG_PATTERN);

export interface AllowedSupplierUrl {
  normalizedUrl: string;
  hostname: string;
  platform: '1688' | 'alibaba';
}

/**
 * Supplier fetches are an SSRF boundary. A valid URL must be a canonical HTTPS
 * 1688/Alibaba URL without credentials or a non-default port; host suffix
 * checks deliberately reject lookalikes such as `1688.com.evil.test`.
 */
export function parseAllowedSupplierUrl(value: string): AllowedSupplierUrl {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new TypeError('supplier_url_invalid');
  }

  if (parsed.protocol !== 'https:') throw new TypeError('supplier_url_https_required');
  if (parsed.username || parsed.password) throw new TypeError('supplier_url_userinfo_forbidden');
  if (parsed.port && parsed.port !== '443') throw new TypeError('supplier_url_port_forbidden');

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const matched = SUPPLIER_HOSTS.find(
    ({ suffix }) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
  if (!matched) throw new TypeError('supplier_url_host_forbidden');

  parsed.hostname = canonicalSupplierHostname(hostname, matched.platform);
  // Supplier query parameters are browser/navigation metadata. Variant is a
  // separately validated Sourcing identity coordinate, so a tracking query
  // cannot create a second candidate identity.
  parsed.search = '';
  parsed.hash = '';
  return {
    normalizedUrl: parsed.toString(),
    hostname: parsed.hostname,
    platform: matched.platform,
  };
}

function canonicalSupplierHostname(
  hostname: string,
  platform: AllowedSupplierUrl['platform'],
): string {
  // Alibaba accepts both public spellings for one product origin. Keep the
  // canonical browser host so every ingestion path stores/locks the same URL.
  if (platform === 'alibaba' && (hostname === 'alibaba.com' || hostname === 'www.alibaba.com')) {
    return 'www.alibaba.com';
  }
  return hostname;
}

export function isAllowedSupplierUrl(value: string): boolean {
  try {
    parseAllowedSupplierUrl(value);
    return true;
  } catch {
    return false;
  }
}

export function sourcePlatformForSupplierUrl(value: string): '1688' | 'alibaba' | null {
  try {
    return parseAllowedSupplierUrl(value).platform;
  } catch {
    return null;
  }
}

export function extractSupplierOfferId(input: AllowedSupplierUrl): string | null {
  if (input.platform !== '1688') return null;
  const match = new URL(input.normalizedUrl).pathname.match(/^\/offer\/(\d+)(?:\.html)?\/?$/);
  return match?.[1] ?? null;
}

function asciiCaseInsensitive(value: string): string {
  return value.replace(/[a-z]/g, (character) => `[${character}${character.toUpperCase()}]`);
}
