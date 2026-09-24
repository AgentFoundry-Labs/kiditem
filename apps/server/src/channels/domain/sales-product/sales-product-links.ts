import type { SalesProductLinkResult, SalesProductLinkSource } from '@kiditem/shared/sales-product';

/**
 * 몰에 올라간 상품(채널 리스팅) ↔ 판매상품 잇기 계획(ADR-0014) — 순수 함수.
 *
 * 코드가 정확히 같을 때만 잇는다(이름으로 잇지 않는다). 근거가 둘 이상이면 모두 같은 판매상품을 가리켜야 하고,
 * 이미 다른 판매상품에 이어진 몰 상품은 건드리지 않는다. 옵션은 몰 상품 · 판매상품 모두 옵션이 하나일 때만
 * 잇고, 그 단품의 셀피아 구성은 비어 있는 몰 옵션 레시피에만 채운다(채우기는 레시피 owner 가 한다).
 */

export interface LinkCandidateListing {
  id: string;
  channel: string;
  externalId: string;
  source: string | null;
  sabangnetProductNo: string | null;
  sellerCode: string | null;
  salesProductId: string | null;
  options: { id: string; salesProductOptionId: string | null; hasRecipe: boolean }[];
}

export interface LinkCandidateProduct {
  id: string;
  /** 발급된 KID. 아직 팔기로 정하지 않은 초안은 비어 있다. */
  code: string | null;
  ownCode: string | null;
  options: {
    id: string;
    supplyStatus: string;
    components: { masterProductId: string; quantity: number }[];
  }[];
}

export interface SendRecordLink {
  mallKey: string;
  mallProductCode: string;
  goodsNo: string;
}

export interface SalesProductLinkPlan {
  listingLinks: { channelListingId: string; salesProductId: string }[];
  optionLinks: { channelListingOptionId: string; salesProductOptionId: string }[];
  recipeFills: { channelListingOptionId: string; components: { masterProductId: string; quantity: number }[] }[];
  summary: Omit<SalesProductLinkResult, 'recipesFilled'>;
}

/** 지마켓 · 옥션은 우리 몰 상품코드가 `{사이트번호}_{마스터번호}` 라 사방넷의 한쪽 번호로도 찾는다. */
function externalIdKeys(channel: string, externalId: string): string[] {
  const keys = [externalId];
  if ((channel === 'gmarket' || channel === 'auction') && externalId.includes('_')) {
    keys.push(...externalId.split('_').filter(Boolean));
  }
  return keys;
}

export function planSalesProductListingLinks(input: {
  listings: readonly LinkCandidateListing[];
  products: readonly LinkCandidateProduct[];
  sendRecords: readonly SendRecordLink[];
}): SalesProductLinkPlan {
  const productByCode = new Map(input.products.map((product) => [product.code, product]));
  const productById = new Map(input.products.map((product) => [product.id, product]));
  const ownCodeCounts = new Map<string, number>();
  for (const product of input.products) {
    if (product.ownCode) ownCodeCounts.set(product.ownCode, (ownCodeCounts.get(product.ownCode) ?? 0) + 1);
  }
  const productByOwnCode = new Map(input.products
    .filter((product) => product.ownCode && ownCodeCounts.get(product.ownCode) === 1)
    .map((product) => [product.ownCode!, product]));
  const goodsByMallCode = new Map<string, Set<string>>();
  for (const record of input.sendRecords) {
    const key = `${record.mallKey}|${record.mallProductCode}`;
    goodsByMallCode.set(key, new Set([...(goodsByMallCode.get(key) ?? []), record.goodsNo]));
  }

  const listingLinks: SalesProductLinkPlan['listingLinks'] = [];
  const optionLinks: SalesProductLinkPlan['optionLinks'] = [];
  const recipeFills: SalesProductLinkPlan['recipeFills'] = [];
  const bySource: Record<SalesProductLinkSource, number> = { sabangnet_record: 0, send_record_file: 0, seller_code: 0 };
  let alreadyLinked = 0;
  let conflicts = 0;

  for (const listing of input.listings) {
    const found = new Map<string, Set<SalesProductLinkSource>>();
    const add = (product: LinkCandidateProduct | undefined, source: SalesProductLinkSource) => {
      if (!product) return;
      found.set(product.id, new Set([...(found.get(product.id) ?? []), source]));
    };
    if (listing.source === 'sabangnet_mall_listings' && listing.sabangnetProductNo) {
      add(productByCode.get(listing.sabangnetProductNo), 'sabangnet_record');
    }
    for (const key of externalIdKeys(listing.channel, listing.externalId)) {
      for (const goodsNo of goodsByMallCode.get(`${listing.channel}|${key}`) ?? []) {
        add(productByCode.get(goodsNo), 'send_record_file');
      }
    }
    if (listing.sellerCode) add(productByOwnCode.get(listing.sellerCode.trim()), 'seller_code');

    if (found.size === 0) continue;
    if (found.size > 1) {
      conflicts += 1;
      continue;
    }
    const [productId, sources] = [...found.entries()][0]!;
    if (listing.salesProductId && listing.salesProductId !== productId) {
      conflicts += 1;
      continue;
    }
    if (listing.salesProductId === productId) alreadyLinked += 1;
    else {
      listingLinks.push({ channelListingId: listing.id, salesProductId: productId });
      for (const source of sources) bySource[source] += 1;
    }

    const product = productById.get(productId)!;
    const productOptions = product.options.filter((option) => option.supplyStatus !== 'unused');
    if (listing.options.length !== 1 || productOptions.length !== 1) continue;
    const [channelOption] = listing.options;
    const [salesOption] = productOptions;
    if (!channelOption!.salesProductOptionId) {
      optionLinks.push({ channelListingOptionId: channelOption!.id, salesProductOptionId: salesOption!.id });
    }
    if (!channelOption!.hasRecipe && salesOption!.components.length > 0) {
      recipeFills.push({ channelListingOptionId: channelOption!.id, components: salesOption!.components });
    }
  }

  return {
    listingLinks,
    optionLinks,
    recipeFills,
    summary: {
      linkedListings: listingLinks.length,
      alreadyLinked,
      linkedOptions: optionLinks.length,
      conflicts,
      bySource,
    },
  };
}
