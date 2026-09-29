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
import { readCurrentKeywordSuggestionFact } from './source-evidence.reader';

@Injectable()
export class SourcingKeywordSuggestionRepositoryAdapter
  implements SourcingKeywordSuggestionRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findLatest(input: {
    organizationId: string;
    normalizedKeyword: string;
  }): Promise<SourcingKeywordSuggestionLatestSnapshot | null> {
    const fact = await readCurrentKeywordSuggestionFact(this.prisma, {
      organizationId: input.organizationId,
      normalizedKeyword: input.normalizedKeyword,
      schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
      collectorVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
    });
    const parsed = SourcingKeywordSuggestionObservationBatchSchema.safeParse(fact?.document);
    if (!parsed.success
      || sourcingWingCatalogKeywordIdentity(parsed.data.keyword) !== input.normalizedKeyword) {
      return null;
    }
    return {
      capturedAt: fact!.capturedAt,
      items: parsed.data.items,
      productNameTokens: parsed.data.productNameTokens,
    };
  }
}
