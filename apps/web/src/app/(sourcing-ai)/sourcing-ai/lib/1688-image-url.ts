const ALIBABA_IMAGE_HOST_SUFFIXES = [
  '.alicdn.com',
  '.tbcdn.cn',
  '.taobaocdn.com',
];

/**
 * Makes 1688 search image URLs safe for the Next.js image optimizer.
 * 1688 payloads may contain protocol-relative or HTTP CDN URLs, both of which
 * fail on the HTTPS office site. Unsupported hosts are rejected so a remote
 * payload cannot make next/image throw for a hostname outside remotePatterns.
 */
export function normalize1688ImageUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALIBABA_IMAGE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  parsed.protocol = 'https:';
  parsed.username = '';
  parsed.password = '';
  return parsed.toString();
}
