import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  WING_CATALOG_EXTENSION_RELOAD_REQUIRED,
  WING_CATALOG_EXTENSION_REQUIRED,
} from '../../wing-catalog/lib/wing-catalog-extension';

export interface CoupangKeywordSuggestion {
  rank: number;
  keyword: string;
  source: 'coupang-autocomplete' | 'coupang-search-dom' | string;
}

export interface CoupangProductNameToken {
  keyword: string;
  count: number;
}

export interface CoupangKeywordSuggestionResponse {
  success?: boolean;
  error?: string;
  opened?: boolean;
  tabId?: number;
  keyword?: string;
  source?: string;
  items?: CoupangKeywordSuggestion[];
  productNameTokens?: CoupangProductNameToken[];
  total?: number;
  warnings?: string[];
}

interface KidItemExtensionPingResponse {
  success?: boolean;
  version?: string;
  capabilities?: {
    coupangKeywordSuggestions?: boolean;
    coupangProductNameTokens?: boolean;
  };
}

export async function searchCoupangKeywordSuggestions(input: {
  keyword: string;
  maxResults?: number;
}): Promise<CoupangKeywordSuggestionResponse> {
  const keyword = input.keyword.trim();
  if (!keyword) throw new Error('검색 키워드를 입력하세요.');

  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(WING_CATALOG_EXTENSION_REQUIRED);

  const ping = await sendToExtension<KidItemExtensionPingResponse>(extensionId, { action: 'ping' });
  if (!ping?.capabilities?.coupangKeywordSuggestions || !ping.capabilities.coupangProductNameTokens) {
    throw new Error(WING_CATALOG_EXTENSION_RELOAD_REQUIRED);
  }
  if (!isExtensionVersionAtLeast(ping.version, '1.2.14')) {
    throw new Error(WING_CATALOG_EXTENSION_RELOAD_REQUIRED);
  }

  const response = await sendToExtension<CoupangKeywordSuggestionResponse>(extensionId, {
    action: 'searchCoupangKeywordSuggestions',
    keyword,
    maxResults: input.maxResults ?? 30,
  });

  if (!response?.success) {
    throw new Error(response?.error ?? '쿠팡 인기 키워드 수집 실패');
  }

  return {
    ...response,
    items: Array.isArray(response.items) ? response.items : [],
    productNameTokens: Array.isArray(response.productNameTokens) ? response.productNameTokens : [],
  };
}

function isExtensionVersionAtLeast(current: string | undefined, minimum: string) {
  if (!current) return false;
  const currentParts = current.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const minimumValue = minimumParts[index] ?? 0;
    if (currentValue > minimumValue) return true;
    if (currentValue < minimumValue) return false;
  }
  return true;
}
