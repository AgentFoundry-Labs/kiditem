// Server-side SSRF defense for image proxy / fetch paths.
//
// Single source of truth shared by `products/domain/policy/public-image-url`
// and `ai/domain/thumbnail-image-source`. Throws `PublicUrlError` for any URL
// that is not http(s) or that resolves to a loopback / private / link-local /
// ULA / unspecified / CGNAT / cloud metadata address — including IPv4-mapped
// and IPv4-compat IPv6 forms after WHATWG URL normalization.
//
// Pure module — no Prisma, no Nest provider, no I/O. Safe to import from any
// `domain/` lane that needs the same posture.
import { isIP } from 'node:net';

export class PublicUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicUrlError';
  }
}

export function assertHttpUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PublicUrlError('invalid image url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PublicUrlError('image url protocol must be http(s)');
  }
}

export function assertPublicHttpUrl(raw: string): void {
  assertHttpUrl(raw);
  // assertHttpUrl already validated parseability + protocol; safe to re-parse.
  const parsed = new URL(raw);

  // `new URL('http://[::1]/').hostname` returns `[::1]` with brackets; strip
  // them before IP classification. IPv6 zone-id (fe80::1%eth0) is also
  // stripped.
  const rawHost = parsed.hostname.toLowerCase();
  let host = rawHost;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const zoneIdx = host.indexOf('%');
  if (zoneIdx !== -1) host = host.slice(0, zoneIdx);
  host = stripTrailingRootDots(host);

  // Hostname blocklist (non-IP).
  if (host === 'localhost' || host.endsWith('.localhost') || host === '') {
    throw new PublicUrlError('image url host not allowed');
  }

  const ipKind = isIP(host);
  // Non-IP hostnames: accept here. A full CDN allowlist + DNS-resolution
  // re-check would block TOCTOU dns rebinding but adds latency; tracked
  // separately. The fetch path still enforces redirect bounds + MIME limits.
  if (ipKind === 0) return;

  if (ipKind === 4) {
    if (isPrivateIPv4(host)) throw new PublicUrlError('image url host not allowed');
    return;
  }

  // RFC 4291 §2.5.5.2 IPv4-mapped (`::ffff:A.B.C.D`) and §2.5.5.1
  // IPv4-compatible (deprecated `::A.B.C.D`) resolve to an embedded IPv4.
  // WHATWG URL normalizes both to 16-bit hex groups — e.g.
  // `::ffff:127.0.0.1` → `::ffff:7f00:1`, `::127.0.0.1` → `::7f00:1`.
  // Decode the last 32 bits and apply IPv4 rules, otherwise
  // `::ffff:127.0.0.1` / `::ffff:169.254.169.254` etc. bypass the loopback +
  // metadata blocks.
  const embeddedV4 = extractEmbeddedIPv4(host);
  if (embeddedV4) {
    if (isPrivateIPv4(embeddedV4)) throw new PublicUrlError('image url host not allowed');
    return;
  }

  // Canonical IPv6 forms for loopback / unspecified / link-local / ULA.
  const blocked6 =
    host === '::1' ||
    host === '::' ||
    /^fe[89ab][0-9a-f]?:/.test(host) || // fe80::/10 link-local (and fe8X:/fe9X:/feAX:/feBX:)
    /^fc[0-9a-f]{2}:/.test(host) || // fc00::/7 ULA
    /^fd[0-9a-f]{2}:/.test(host); // fd00::/8 ULA
  if (blocked6) throw new PublicUrlError('image url host not allowed');
}

function extractEmbeddedIPv4(host: string): string | null {
  // Text forms (rare after URL normalization but keep for defense-in-depth).
  const mapText = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (mapText && isIP(mapText[1]) === 4) return mapText[1];
  const compatText = /^::(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (compatText && isIP(compatText[1]) === 4) return compatText[1];

  // Hex forms produced by WHATWG URL: `::ffff:HHHH:HHHH` / `::HHHH:HHHH`.
  const decodeHex = (hi: string, lo: string): string => {
    const h = parseInt(hi, 16);
    const l = parseInt(lo, 16);
    return `${(h >> 8) & 0xff}.${h & 0xff}.${(l >> 8) & 0xff}.${l & 0xff}`;
  };
  const mapHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mapHex) return decodeHex(mapHex[1], mapHex[2]);
  // `::HHHH:HHHH` (IPv4-compat). Skip `::1` / `::` — handled by literal check.
  const compatHex = /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (compatHex) return decodeHex(compatHex[1], compatHex[2]);

  return null;
}

function stripTrailingRootDots(host: string): string {
  return host.replace(/\.+$/, '');
}

function isPrivateIPv4(ip: string): boolean {
  return (
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^0\./.test(ip) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)
  );
}
