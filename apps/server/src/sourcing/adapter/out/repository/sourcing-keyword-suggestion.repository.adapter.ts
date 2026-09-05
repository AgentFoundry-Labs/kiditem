import { Injectable } from '@nestjs/common';
import {
  SourcingKeywordSuggestionObservationBatchSchema,
  SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
  SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
  sourcingWingCatalogKeywordIdentity,
} from '@kiditem/shared/sourcing';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SourcingKeywordSuggestionLatestSnapshot,
  SourcingKeywordSuggestionRepositoryPort,
} from '../../../application/port/out/repository/sourcing-keyword-suggestion.repository.port';

@Injectable()
export class SourcingKeywordSuggestionRepositoryAdapter
  implements SourcingKeywordSuggestionRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findLatest(input: {
    organizationId: string;
    normalizedKeyword: string;
  }): Promise<SourcingKeywordSuggestionLatestSnapshot | null> {
    const observation = await this.prisma.sourcingEvidenceObservation.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
        platform: 'coupang',
        evidenceFamily: 'keyword_suggestion',
        schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
        conceptKey: input.normalizedKeyword,
        supersededByObservation: null,
        ingestionRun: {
          organizationId: input.organizationId,
          sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
          scopeKey: 'default',
          targetKey: `keyword:${input.normalizedKeyword}`,
          collectorVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
          status: 'COMPLETE',
          isCurrentComplete: true,
          completedAt: { not: null },
        },
      },
      select: { payload: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
    });
    const parsed = SourcingKeywordSuggestionObservationBatchSchema.safeParse(observation?.payload);
    if (!parsed.success
      || sourcingWingCatalogKeywordIdentity(parsed.data.keyword) !== input.normalizedKeyword) {
      return null;
    }
    return {
      capturedAt: new Date(parsed.data.capturedAt),
      items: parsed.data.items,
      productNameTokens: parsed.data.productNameTokens,
    };
  }
}
