import { createHash } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import {
  type SourcingListingPrepCapabilityInput,
  type SourcingListingPrepCapabilityPort,
  type SourcingListingPrepCapabilityResult,
} from '../../../application/port/in/capability/sourcing-capability.ports';
import { SourcingService } from '../../../application/service/sourcing.service';

const PRODUCT_LISTING_PREP_KEY = 'product_listing.create_generation_package';

const ListingPrepInputSchema = z.object({
  productName: z.string().trim().min(1),
  category: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  target: z.string().trim().nullable().optional(),
  imageUrls: z.array(z.string().trim().min(1)).min(1),
  thumbnailUrl: z.string().trim().nullable().optional(),
  thumbnailUrls: z.array(z.string().trim().min(1)).optional(),
  optionNames: z.array(z.string().trim().min(1)).optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  templateId: z.enum(['kids-playful', 'bold-vertical']).optional(),
  ageGroup: z.enum(['age-8-plus', 'age-14-plus']).optional(),
  detailImageCount: z.enum(['2', '3', '4', '5', '6']).optional(),
  usageSectionMode: z.enum(['include', 'exclude']).optional(),
  kcCertificationStatus: z.enum(['unknown', 'none', 'exists']).optional(),
  kcCertificationNumber: z.string().trim().nullable().optional(),
  productSize: z.string().trim().nullable().optional(),
  colorVariantStatus: z.string().trim().nullable().optional(),
  colorVariantNames: z.string().trim().nullable().optional(),
  boxSetStatus: z.string().trim().nullable().optional(),
  boxSetQuantity: z.string().trim().nullable().optional(),
});

const ListingPrepOutputSchema = z.object({
  candidateId: z.string(),
  parentOperationKey: z.string(),
  detailGenerationId: z.string().nullable(),
  thumbnailGenerationId: z.string().nullable(),
  contentWorkspaceId: z.string().nullable(),
  href: z.string(),
});

type ListingPrepInput = z.infer<typeof ListingPrepInputSchema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }
  return value;
}

function stableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')
    .slice(0, 24);
}

function optional(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

@Injectable()
export class SourcingListingPrepCapabilityAdapter
  implements OnModuleInit, SourcingListingPrepCapabilityPort
{
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    private readonly sourcing: SourcingService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler());
  }

  async createGenerationPackage(
    input: SourcingListingPrepCapabilityInput,
  ): Promise<SourcingListingPrepCapabilityResult> {
    const result = await this.sourcing.createProductGeneration(
      {
        title: input.productName,
        category: optional(input.category),
        description: optional(input.description),
        target: optional(input.target),
        imageUrls: input.imageUrls,
        thumbnailUrl: optional(input.thumbnailUrl),
        thumbnailUrls: input.thumbnailUrls,
        optionNames: input.optionNames,
        keywords: input.keywords,
        templateId: input.templateId ?? 'bold-vertical',
        ageGroup: input.ageGroup ?? 'age-8-plus',
        detailImageCount: input.detailImageCount ?? '2',
        usageSectionMode: input.usageSectionMode ?? 'include',
        kcCertificationStatus: input.kcCertificationStatus ?? 'unknown',
        kcCertificationNumber: optional(input.kcCertificationNumber),
        productSize: optional(input.productSize),
        colorVariantStatus: optional(input.colorVariantStatus),
        colorVariantNames: optional(input.colorVariantNames),
        boxSetStatus: optional(input.boxSetStatus),
        boxSetQuantity: optional(input.boxSetQuantity),
      },
      input.organizationId,
      input.triggeredByUserId ?? null,
    );

    return {
      candidateId: result.candidateId,
      href: result.href,
      parentOperationKey: result.parentOperationKey,
      detailGenerationId: result.detailGenerationId,
      thumbnailGenerationId: result.thumbnailGenerationId,
      contentWorkspaceId: result.contentWorkspaceId,
    };
  }

  private handler(): AgentCapabilityHandler<ListingPrepInput> {
    return {
      key: PRODUCT_LISTING_PREP_KEY,
      ownerDomain: 'sourcing',
      executionKind: 'workflow',
      inputSchema: ListingPrepInputSchema,
      outputSchema: ListingPrepOutputSchema,
      sideEffects: ['db_write', 'job_enqueue'],
      approvalRisk: 'low',
      idempotencyKey: ({ organizationId, input }) =>
        [
          organizationId,
          PRODUCT_LISTING_PREP_KEY,
          stableHash(input),
        ].join(':'),
      execute: async ({ organizationId, requestedByUserId, input }) => {
        const result = await this.createGenerationPackage({
          organizationId,
          triggeredByUserId: requestedByUserId ?? null,
          ...input,
        });
        const outputSummary: Record<string, unknown> = { ...result };
        return {
          resourceType: 'sourcing_candidate',
          resourceId: result.candidateId,
          outputSummary,
          artifacts: [
            {
              artifactType: 'listing_prep_package',
              targetDomain: 'sourcing',
              targetModel: 'ProductGenerationPackage',
              targetId: result.candidateId,
              title: `${input.productName} 등록 준비 패키지`,
              href: result.href,
              summary: {
                productName: input.productName,
                candidateId: result.candidateId,
                parentOperationKey: result.parentOperationKey,
                detailGenerationId: result.detailGenerationId,
                thumbnailGenerationId: result.thumbnailGenerationId,
                contentWorkspaceId: result.contentWorkspaceId,
              },
            },
          ],
        };
      },
    };
  }
}
