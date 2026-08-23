import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import type {
  ProductsListingGenerationCapabilityPort,
  ProductsListingGenerationInput,
  ProductsListingGenerationResult,
} from '../../../application/port/in/capability/listing-generation.port';

/** Products owns generation-package enqueueing for an already persisted candidate. */
@Injectable()
export class ProductsListingGenerationCapabilityAdapter
  implements ProductsListingGenerationCapabilityPort
{
  constructor(
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operations: OperationRunnerPort,
  ) {}

  async createListingGenerationPackage(
    input: ProductsListingGenerationInput,
  ): Promise<ProductsListingGenerationResult> {
    const generation = normalizeGenerationInput(input);
    const requestHash = createHash('sha256')
      .update(canonicalJson(generation))
      .digest('hex');
    const run = await this.operations.start({
      organizationId: input.organizationId,
      operationKey: 'products.generate_listing_package',
      triggerSource: 'agent',
      input: {
        ...generation,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      },
      requestedByUserId: input.triggeredByUserId ?? null,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      candidateId: generation.candidateId,
      operationRunId: run.id,
      status: run.status,
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

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
