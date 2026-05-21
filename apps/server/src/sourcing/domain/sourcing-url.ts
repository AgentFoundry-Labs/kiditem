export type SourcingScrapePlatform = '1688' | 'ALIBABA';

const SUPPORTED_SOURCING_HOSTS: Array<{ host: string; platform: SourcingScrapePlatform }> = [
  { host: '1688.com', platform: '1688' },
  { host: 'alibaba.com', platform: 'ALIBABA' },
];

export function detectSourcingScrapePlatform(value: string): SourcingScrapePlatform | null {
  const parsed = parseHttpUrl(value);
  if (!parsed) return null;
  const hostname = parsed.hostname.toLowerCase();
  const match = SUPPORTED_SOURCING_HOSTS.find(({ host }) => (
    hostname === host || hostname.endsWith(`.${host}`)
  ));
  return match?.platform ?? null;
}

export function isSupportedSourcingScrapeUrl(value: string): boolean {
  return detectSourcingScrapePlatform(value) !== null;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed;
  } catch {
    return null;
  }
}
