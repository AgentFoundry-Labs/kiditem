import { Inject, Injectable } from '@nestjs/common';
import {
  Sourcing1688ImageMatchInputSchema,
  Sourcing1688KeywordBatchInputSchema,
  Sourcing1688SearchSnapshotSchema,
  type Sourcing1688SearchSnapshot,
} from '@kiditem/shared/sourcing';
import {
  SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT,
  type Sourcing1688SearchResultRepositoryPort,
} from '../port/out/repository/sourcing-1688-search-result.repository.port';

@Injectable()
export class Sourcing1688SearchResultService {
  constructor(
    @Inject(SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT)
    private readonly repository: Sourcing1688SearchResultRepositoryPort,
  ) {}

  async latest(input: {
    organizationId: string;
    keywords?: string[];
    targetIds?: string[];
  }): Promise<Sourcing1688SearchSnapshot> {
    const keywords = input.keywords && input.keywords.length > 0
      ? Sourcing1688KeywordBatchInputSchema.parse({ keywords: input.keywords }).keywords
      : undefined;
    const targetIds = input.targetIds && input.targetIds.length > 0
      ? Sourcing1688ImageMatchInputSchema.parse({ targetIds: input.targetIds }).targetIds
      : undefined;
    const snapshot = await this.repository.findLatest({
      organizationId: input.organizationId,
      keywords,
      targetIds,
    });
    return Sourcing1688SearchSnapshotSchema.parse({
      generatedAt: snapshot.generatedAt?.toISOString() ?? null,
      observations: snapshot.observations.map((observation) => ({
        keyword: observation.keyword,
        targetId: observation.targetId,
        capturedAt: observation.capturedAt.toISOString(),
        items: observation.items,
      })),
    });
  }
}
