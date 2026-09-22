import * as dns from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent } from 'undici';
import {
  PublicUrlError,
  assertPublicHttpUrl,
  assertPublicIpAddress,
} from '../../../../common/security/public-url';

type PublicImageLookupOptions = {
  all?: boolean;
  family?: number;
  hints?: number;
  verbatim?: boolean;
};

type PublicImageLookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

export const publicImageDispatcher = new Agent({
  connect: { lookup: publicImageLookup },
});

export async function assertSafePublicImageUrl(url: URL): Promise<void> {
  assertPublicHttpUrl(url.toString());
  await resolvePublicHostAddresses(url.hostname);
}

function publicImageLookup(
  hostname: string,
  options: PublicImageLookupOptions,
  callback: PublicImageLookupCallback,
): void {
  void resolvePublicHostAddresses(hostname, options.family)
    .then((records) => {
      if (options.all) {
        callback(null, records);
        return;
      }
      const record =
        records.find((entry) => matchesLookupFamily(entry, options.family)) ??
        records[0];
      callback(null, record.address, record.family);
    })
    .catch((error: unknown) => {
      callback(toLookupError(error), []);
    });
}

async function resolvePublicHostAddresses(
  hostname: string,
  family?: number,
): Promise<Array<{ address: string; family: number }>> {
  const host = normalizeLookupHost(hostname);
  const ipFamily = isIP(host);
  if (ipFamily !== 0) {
    assertPublicIpAddress(host);
    return [{ address: host, family: ipFamily }];
  }

  const records = await dns.lookup(host, {
    all: true,
    family,
    verbatim: true,
  });
  const matchingRecords = records.filter((record) =>
    matchesLookupFamily(record, family),
  );
  if (matchingRecords.length === 0) {
    throw new PublicUrlError('image host lookup returned no addresses');
  }
  for (const record of matchingRecords) {
    assertPublicIpAddress(record.address);
  }
  return matchingRecords;
}

function matchesLookupFamily(
  record: { family: number },
  family: number | undefined,
): boolean {
  return family == null || family === 0 || record.family === family;
}

function normalizeLookupHost(hostname: string): string {
  let host = hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const zoneIndex = host.indexOf('%');
  if (zoneIndex !== -1) host = host.slice(0, zoneIndex);
  return host.replace(/\.+$/, '');
}

function toLookupError(error: unknown): NodeJS.ErrnoException {
  if (error instanceof Error) return error as NodeJS.ErrnoException;
  return new Error(String(error)) as NodeJS.ErrnoException;
}
