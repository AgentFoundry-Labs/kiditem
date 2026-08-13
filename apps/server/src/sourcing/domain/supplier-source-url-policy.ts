const SUPPLIER_HOSTS: ReadonlyArray<{
  suffix: string;
  platform: '1688' | 'alibaba';
}> = [
  { suffix: '1688.com', platform: '1688' },
  { suffix: 'alibaba.com', platform: 'alibaba' },
];

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

  parsed.hostname = hostname;
  parsed.hash = '';
  return {
    normalizedUrl: parsed.toString(),
    hostname,
    platform: matched.platform,
  };
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
