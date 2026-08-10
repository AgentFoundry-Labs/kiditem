import type {
  SourcingInterestSource,
  SourcingInterestTarget,
  SourcingInterestTargetCommand,
} from '@kiditem/shared/sourcing';

export function createKeywordInterestTarget(input: {
  keyword: string;
  source: SourcingInterestSource;
}): SourcingInterestTargetCommand {
  const keyword = input.keyword.trim();
  return {
    targetType: 'keyword',
    source: input.source,
    label: keyword,
    keyword,
  };
}

export function createCategoryInterestTarget(input: {
  category: string;
  source: SourcingInterestSource;
}): SourcingInterestTargetCommand {
  const category = input.category.trim();
  return {
    targetType: 'category',
    source: input.source,
    label: category,
    category,
  };
}

export function createProductInterestTarget(input: {
  productId: string;
  productName: string;
  itemId?: string | null;
  vendorItemId?: string | null;
}): SourcingInterestTargetCommand {
  return {
    targetType: 'product',
    source: 'today_recommendation',
    label: input.productName,
    productId: input.productId,
    itemId: input.itemId ?? null,
    vendorItemId: input.vendorItemId ?? null,
    productName: input.productName,
  };
}

export function interestTargetSource(target: SourcingInterestTarget): SourcingInterestSource {
  return target.sourceKeys[0] ?? 'manual';
}
