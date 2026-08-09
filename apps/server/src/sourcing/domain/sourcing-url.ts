export type SourcingScrapePlatform = '1688' | 'ALIBABA';
import { sourcePlatformForSupplierUrl } from './supplier-source-url-policy';

export function detectSourcingScrapePlatform(value: string): SourcingScrapePlatform | null {
  const platform = sourcePlatformForSupplierUrl(value);
  if (platform === '1688') return '1688';
  if (platform === 'alibaba') return 'ALIBABA';
  return null;
}

export function isSupportedSourcingScrapeUrl(value: string): boolean {
  return detectSourcingScrapePlatform(value) !== null;
}
