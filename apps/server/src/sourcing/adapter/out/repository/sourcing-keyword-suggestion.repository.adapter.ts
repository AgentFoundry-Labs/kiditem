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

const MAX_CANDIDATES = 24;
const COLLECTOR_KEY = 'coupang-keyword-suggestion-operation';

@Injectable()
export class SourcingKeywordSuggestionRepositoryAdapter
  implements SourcingKeywordSuggestionRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findLatest(input: {
    organizationId: string;
    normalizedKeyword: string;
  }): Promise<SourcingKeywordSuggestionLatestSnapshot | null> {
    const runs = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: {
        organizationId: input.organizationId,
        sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
        scopeKey: 'default',
        targetKey: `keyword:${input.normalizedKeyword}`,
        collectorKey: COLLECTOR_KEY,
        collectorVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
        status: { in: ['complete', 'partial'] },
        completedAt: { not: null },
      },
      select: { id: true, completedAt: true },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: MAX_CANDIDATES,
    });
    if (runs.length === 0) return null;

    const observations = await this.prisma.sourcingEvidenceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        ingestionRunId: { in: runs.map((run) => run.id) },
        sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
        platform: 'coupang',
        evidenceFamily: 'keyword_suggestion',
        schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
        conceptKey: input.normalizedKeyword,
        supersededByObservation: null,
      },
      select: { ingestionRunId: true, payload: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: MAX_CANDIDATES,
    });
    const observationsByRun = new Map<string, unknown>();
    for (const observation of observations) {
      if (!observationsByRun.has(observation.ingestionRunId)) {
        observationsByRun.set(observation.ingestionRunId, observation.payload);
      }
    }
    for (const run of runs) {
      const parsed = SourcingKeywordSuggestionObservationBatchSchema.safeParse(
        observationsByRun.get(run.id),
      );
      if (
        !parsed.success ||
        sourcingWingCatalogKeywordIdentity(parsed.data.keyword) !==
          input.normalizedKeyword
      ) {
        continue;
      }
      return {
        capturedAt: new Date(parsed.data.capturedAt),
        items: parsed.data.items,
        productNameTokens: parsed.data.productNameTokens,
      };
    }
    return null;
  }
}
