import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  ALLOWED_SOURCING_COLLECTION_SOURCES,
  isAllowedSourcingCollectionSource,
} from '../../domain/sourcing-collection-source-policy';
import {
  SOURCING_COLLECTION_SOURCE_CONTROL_REPOSITORY_PORT,
  type SourcingCollectionSourceControlRepositoryPort,
} from '../port/out/repository/sourcing-collection-source-control.repository.port';

@Injectable()
export class SourcingCollectionSourceControlService {
  constructor(
    @Inject(SOURCING_COLLECTION_SOURCE_CONTROL_REPOSITORY_PORT)
    private readonly repository: SourcingCollectionSourceControlRepositoryPort,
  ) {}

  async list(organizationId: string) {
    const controls = await this.repository.findBySourceKeys({
      organizationId,
      sourceKeys: [...ALLOWED_SOURCING_COLLECTION_SOURCES],
    });
    const bySourceKey = new Map(controls.map((control) => [control.sourceKey, control]));
    return ALLOWED_SOURCING_COLLECTION_SOURCES.map((sourceKey) => {
      const control = bySourceKey.get(sourceKey);
      return {
        sourceKey,
        enabled: control?.enabled ?? true,
        updatedAt: control?.updatedAt ?? null,
      };
    });
  }

  async setEnabled(input: {
    organizationId: string;
    sourceKey: string;
    enabled: boolean;
  }) {
    if (!isAllowedSourcingCollectionSource(input.sourceKey)) {
      throw new BadRequestException({ code: 'source_not_allowed' });
    }
    return this.repository.setEnabled(input);
  }
}
