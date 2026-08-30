import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  SOURCING_KEYWORD_PREFERENCE_REPOSITORY_PORT,
  type SourcingKeywordPreferenceRepositoryPort,
} from '../port/out/repository/sourcing-keyword-preference.repository.port';

@Injectable()
export class SourcingKeywordPreferenceService {
  constructor(
    @Inject(SOURCING_KEYWORD_PREFERENCE_REPOSITORY_PORT)
    private readonly repository: SourcingKeywordPreferenceRepositoryPort,
  ) {}

  list(organizationId: string) {
    return this.repository.list(organizationId);
  }

  async save(input: {
    organizationId: string;
    keyword: string;
    excluded: boolean;
    expectedVersion: number;
  }) {
    const displayKeyword = normalizeDisplayKeyword(input.keyword);
    if (!displayKeyword) throw new BadRequestException('키워드가 필요합니다.');
    const result = await this.repository.save({
      organizationId: input.organizationId,
      keywordNormalized: normalizeKeywordKey(displayKeyword),
      displayKeyword,
      excluded: input.excluded,
      expectedVersion: input.expectedVersion,
    });
    if (result.kind === 'version_conflict') {
      throw new ConflictException({
        code: 'KEYWORD_PREFERENCE_VERSION_CONFLICT',
        currentVersion: result.currentVersion,
      });
    }
    return result.preference;
  }
}

function normalizeDisplayKeyword(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 200);
}

function normalizeKeywordKey(value: string): string {
  return value.replace(/\s+/g, '').toLocaleLowerCase('en-US');
}
