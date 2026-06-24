import { describe, it, expect } from 'vitest';
import {
  PublicUrlError,
  assertHttpUrl,
  assertPublicHttpUrl,
  assertPublicIpAddress,
} from '../public-url';

/**
 * Pure unit tests for the SSRF defense shared by products + ai domains.
 *
 * The integration angle (BadRequestException mapping inside MastersService)
 * is exercised by `apps/server/src/products/application/service/__tests__/
 * masters-ssrf.spec.ts`, which still drives the same blocklist through the
 * service surface. These tests focus on the policy itself so a regression
 * in the host classification logic is caught even when no caller is wired.
 */

describe('public-url policy', () => {
  describe('assertHttpUrl', () => {
    it('accepts http and https', () => {
      expect(() => assertHttpUrl('http://example.com/x.png')).not.toThrow();
      expect(() => assertHttpUrl('https://cdn.example.com/x.png')).not.toThrow();
    });

    it('rejects malformed URLs', () => {
      expect(() => assertHttpUrl('not-a-url')).toThrow(PublicUrlError);
      expect(() => assertHttpUrl('')).toThrow(PublicUrlError);
    });

    it('rejects non-http(s) schemes', () => {
      const cases = [
        'ftp://example.com/x.png',
        'file:///etc/passwd',
        'data:image/png;base64,AAAA',
        'javascript:alert(1)',
        'gopher://example.com/',
      ];
      for (const url of cases) {
        expect(() => assertHttpUrl(url), `should reject ${url}`).toThrow(PublicUrlError);
      }
    });
  });

  describe('assertPublicHttpUrl — blocked hosts', () => {
    const cases: Array<[string, string]> = [
      ['http://localhost/x.png', 'localhost'],
      ['http://localhost./x.png', 'localhost with trailing root dot'],
      ['http://foo.localhost/x.png', 'localhost subdomain'],
      ['http://foo.localhost./x.png', 'localhost subdomain with trailing root dot'],
      ['http://127.0.0.1/x.png', 'IPv4 loopback'],
      ['http://10.0.0.5/x.png', 'RFC1918 10/8'],
      ['http://192.168.1.1/x.png', 'RFC1918 192.168/16'],
      ['http://172.16.5.5/x.png', 'RFC1918 172.16/12'],
      ['http://169.254.169.254/meta', 'cloud metadata 169.254.169.254'],
      ['http://0.0.0.0/x.png', 'unspecified 0.0.0.0'],
      ['http://100.64.0.1/x.png', 'CGNAT 100.64/10'],
      ['http://[::1]/x.png', 'IPv6 loopback ::1'],
      ['http://[::]/x.png', 'IPv6 unspecified ::'],
      ['http://[fe80::1]/x.png', 'IPv6 link-local fe80::/10'],
      ['http://[fe80::1%eth0]/x.png', 'IPv6 link-local with zone id'],
      ['http://[fc00::1]/x.png', 'IPv6 ULA fc00::/7'],
      ['http://[fd12::1]/x.png', 'IPv6 ULA fd00::/8'],
      ['http://[::ffff:127.0.0.1]/x.png', 'IPv4-mapped IPv6 loopback'],
      ['http://[::ffff:10.0.0.1]/x.png', 'IPv4-mapped IPv6 RFC1918 10/8'],
      ['http://[::ffff:192.168.1.1]/x.png', 'IPv4-mapped IPv6 RFC1918 192.168/16'],
      ['http://[::ffff:169.254.169.254]/meta', 'IPv4-mapped IPv6 cloud metadata'],
      ['http://[::127.0.0.1]/x.png', 'IPv4-compatible IPv6 deprecated form (loopback)'],
      ['http://[::169.254.169.254]/meta', 'IPv4-compatible IPv6 deprecated form (metadata)'],
      ['ftp://example.com/x.png', 'non-http scheme'],
    ];

    for (const [url, label] of cases) {
      it(`blocks ${label} (${url})`, () => {
        expect(() => assertPublicHttpUrl(url)).toThrow(PublicUrlError);
      });
    }
  });

  describe('assertPublicHttpUrl — allowed hosts', () => {
    const cases: Array<[string, string]> = [
      ['https://cdn.example.com/a.png', 'public HTTPS hostname'],
      ['https://cdn.example.com./a.png', 'public HTTPS hostname with trailing root dot'],
      ['http://example.com/x.png', 'public HTTP hostname'],
      ['https://1.1.1.1/x.png', 'public IPv4 (Cloudflare DNS)'],
      ['https://8.8.8.8/x.png', 'public IPv4 (Google DNS)'],
      ['http://image-pkimg-com.akamaized.net/foo.jpg', 'CDN-style hostname with hyphens'],
      ['https://[2001:4860:4860::8888]/x.png', 'public IPv6 (Google DNS)'],
    ];

    for (const [url, label] of cases) {
      it(`allows ${label} (${url})`, () => {
        expect(() => assertPublicHttpUrl(url)).not.toThrow();
      });
    }
  });

  describe('assertPublicIpAddress', () => {
    it('applies the same blocklist to DNS-resolved addresses', () => {
      expect(() => assertPublicIpAddress('169.254.169.254')).toThrow(PublicUrlError);
      expect(() => assertPublicIpAddress('::ffff:7f00:1')).toThrow(PublicUrlError);
      expect(() => assertPublicIpAddress('93.184.216.34')).not.toThrow();
    });
  });

  describe('error shape', () => {
    it('is a PublicUrlError instance with the expected name', () => {
      try {
        assertPublicHttpUrl('http://localhost/x.png');
      } catch (error) {
        expect(error).toBeInstanceOf(PublicUrlError);
        expect((error as Error).name).toBe('PublicUrlError');
        return;
      }
      expect.fail('expected assertPublicHttpUrl to throw');
    });
  });
});
