import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
  type ProductGenerationAiTriggerPort,
} from '../../../../content/application/port/in/generation/product-generation-ai-trigger.port';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import type {
  ProductsListingGenerationCapabilityPort,
  ProductsListingGenerationInput,
  ProductsListingGenerationResult,
} from '../../../application/port/in/capability/listing-generation.port';

/** Products owns the capability boundary for generation on an existing candidate. */
@Injectable()
export class ProductsListingGenerationCapabilityAdapter
  implements ProductsListingGenerationCapabilityPort
{
  constructor(
    @Inject(PRODUCT_GENERATION_AI_TRIGGER_PORT)
    private readonly productGeneration: ProductGenerationAiTriggerPort,
  ) {}

  async createListingGenerationPackage(
    input: ProductsListingGenerationInput,
  ): Promise<ProductsListingGenerationResult> {
    const generation = normalizeGenerationInput(input);
    const requestHash = requiredInputHash(
      input.inputHash,
      capabilityInput(input),
    );
    const result = await this.productGeneration.startForSalesProduct({
      ...generation,
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      triggeredByUserId: input.triggeredByUserId ?? null,
    });
    return {
      salesProductId: result.salesProductId,
      detailPageId: result.detailPageId,
      thumbnailGenerationId: result.thumbnailGenerationId,
      contentWorkspaceId: result.contentWorkspaceId,
      href: result.href,
    };
  }
}

function normalizeGenerationInput(input: ProductsListingGenerationInput) {
  return {
    salesProductId: input.salesProductId,
    productBrief: {
      productName: input.productName?.trim() ?? '',
      imageUrls: input.imageUrls ?? [],
      category: input.category ?? null,
      description: input.description ?? null,
      target: input.target ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      optionNames: input.optionNames ?? [],
      productSize: input.productSize ?? null,
      colorVariantStatus: input.colorVariantStatus ?? 'auto',
      colorVariantNames: splitNames(input.colorVariantNames),
      boxSetStatus: input.boxSetStatus ?? 'auto',
      boxSetQuantity: parseCount(input.boxSetQuantity),
    },
    templateId: input.templateId ?? 'bold-vertical',
    ageGroup: input.ageGroup ?? 'age-8-plus',
    detailImageCount: input.detailImageCount ?? '2',
    usageSectionMode: input.usageSectionMode ?? 'include',
    kcCertificationStatus: input.kcCertificationStatus ?? 'unknown',
    kcCertificationNumber: input.kcCertificationNumber ?? null,
    task: input.task ?? 'all',
  };
}

/** 화면이 쉼표로 적어 보내는 색상 이름. 초안 컬럼과 같은 배열 모양으로 맞춘다. */
function splitNames(value: string | null | undefined): string[] {
  return [...new Set((value ?? '').split(',').map((name) => name.trim()).filter(Boolean))];
}

function parseCount(value: string | null | undefined): number | null {
  if (!value) return null;
  const count = Number.parseInt(value, 10);
  return Number.isInteger(count) && count > 0 ? count : null;
}

function capabilityInput(input: ProductsListingGenerationInput): Record<string, unknown> {
  const {
    organizationId: _organizationId,
    idempotencyKey: _idempotencyKey,
    inputHash: _inputHash,
    triggeredByUserId: _triggeredByUserId,
    ...businessInput
  } = input;
  return businessInput;
}

function requiredInputHash(value: string, input: unknown): string {
  if (
    !/^[a-f0-9]{64}$/.test(value)
    || value !== canonicalOwnerInputHash(input)
  ) {
    throw new Error('owner_input_hash_required');
  }
  return value;
}
