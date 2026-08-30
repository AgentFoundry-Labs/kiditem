import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
  type SourcingInterestTargetRecord,
  type SourcingInterestTargetRepositoryPort,
  type SourcingInterestTargetSource,
  type SourcingInterestTargetType,
} from '../port/out/repository/sourcing-interest-target.repository.port';

@Injectable()
export class SourcingInterestTargetService {
  constructor(
    @Inject(SOURCING_INTEREST_TARGET_REPOSITORY_PORT)
    private readonly repository: SourcingInterestTargetRepositoryPort,
  ) {}

  list(organizationId: string): Promise<SourcingInterestTargetRecord[]> {
    return this.repository.list(organizationId);
  }

  async upsert(input: {
    organizationId: string;
    targetType: SourcingInterestTargetType;
    source: SourcingInterestTargetSource;
    label?: string;
    keyword?: string;
    category?: string;
    productId?: string;
    itemId?: string | null;
    vendorItemId?: string | null;
    productName?: string;
  }): Promise<SourcingInterestTargetRecord> {
    const target = normalizeTarget(input);
    return this.repository.upsert({ organizationId: input.organizationId, source: input.source, ...target });
  }

  async remove(input: { organizationId: string; id: string }): Promise<void> {
    if (await this.repository.delete(input)) return;
    throw new NotFoundException('관심 소싱 대상을 찾을 수 없습니다.');
  }
}

function normalizeTarget(input: {
  targetType: SourcingInterestTargetType;
  label?: string;
  keyword?: string;
  category?: string;
  productId?: string;
  itemId?: string | null;
  vendorItemId?: string | null;
  productName?: string;
}) {
  if (input.targetType === 'keyword') {
    const keyword = requiredText(input.keyword, '관심 키워드');
    return {
      targetKey: `keyword:${compactKey(keyword)}`,
      targetType: 'keyword' as const,
      label: optionalText(input.label) ?? keyword,
      keyword,
      category: null,
      productId: null,
      itemId: null,
      vendorItemId: null,
      productName: null,
    };
  }
  if (input.targetType === 'category') {
    const category = requiredText(input.category, '관심 카테고리');
    return {
      targetKey: `category:${compactKey(category)}`,
      targetType: 'category' as const,
      label: optionalText(input.label) ?? category,
      keyword: null,
      category,
      productId: null,
      itemId: null,
      vendorItemId: null,
      productName: null,
    };
  }
  const productId = requiredText(input.productId, '상품 ID');
  const itemId = optionalText(input.itemId);
  const vendorItemId = optionalText(input.vendorItemId);
  const productName = optionalText(input.productName);
  return {
    targetKey: `product:${productId}:${itemId ?? ''}:${vendorItemId ?? ''}`,
    targetType: 'product' as const,
    label: optionalText(input.label) ?? productName ?? productId,
    keyword: null,
    category: null,
    productId,
    itemId,
    vendorItemId,
    productName,
  };
}

function requiredText(value: string | undefined, label: string): string {
  const text = optionalText(value);
  if (!text) throw new BadRequestException(`${label}이 필요합니다.`);
  return text;
}

function optionalText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text.slice(0, 500) : null;
}

function compactKey(value: string): string {
  return value.replace(/\s+/g, '').toLocaleLowerCase('en-US');
}
