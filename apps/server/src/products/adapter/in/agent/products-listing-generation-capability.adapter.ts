import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
  type ProductGenerationAiTriggerPort,
} from '../../../../ai/application/port/in/generation/product-generation-ai-trigger.port';
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
    const result = await this.productGeneration.startForCandidate({
      ...generation,
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      triggeredByUserId: input.triggeredByUserId ?? null,
    });
    return {
      candidateId: result.candidateId,
      detailGenerationId: result.detailGenerationId,
      thumbnailGenerationId: result.thumbnailGenerationId,
      contentWorkspaceId: result.contentWorkspaceId,
      href: result.href,
    };
  }
}

function normalizeGenerationInput(input: ProductsListingGenerationInput) {
  return {
    candidateId: input.candidateId,
    productName: input.productName?.trim() ?? '',
    imageUrls: input.imageUrls ?? [],
    category: input.category ?? null,
    description: input.description ?? null,
    target: input.target ?? null,
    thumbnailUrl: input.thumbnailUrl ?? null,
    optionNames: input.optionNames ?? [],
    templateId: input.templateId ?? 'bold-vertical',
    ageGroup: input.ageGroup ?? 'age-8-plus',
    detailImageCount: input.detailImageCount ?? '2',
    usageSectionMode: input.usageSectionMode ?? 'include',
    kcCertificationStatus: input.kcCertificationStatus ?? 'unknown',
    kcCertificationNumber: input.kcCertificationNumber ?? null,
    productSize: input.productSize ?? null,
    colorVariantStatus: input.colorVariantStatus ?? 'auto',
    colorVariantNames: input.colorVariantNames ?? null,
    boxSetStatus: input.boxSetStatus ?? 'auto',
    boxSetQuantity: input.boxSetQuantity ?? null,
    task: input.task ?? 'all',
  };
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
