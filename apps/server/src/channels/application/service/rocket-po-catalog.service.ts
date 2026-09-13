import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  RocketPoSourceBeginSchema,
  RocketPoSourceSubmissionSchema,
} from '@kiditem/shared/rocket-purchase-preview';
import type { RocketPoCatalogPort } from '../port/in/rocket-po-catalog.port';
import {
  ROCKET_PO_CATALOG_REPOSITORY_PORT,
  type RocketPoCatalogRepositoryPort,
} from '../port/out/repository/rocket-po-catalog.repository.port';

@Injectable()
export class RocketPoCatalogService implements RocketPoCatalogPort {
  constructor(
    @Inject(ROCKET_PO_CATALOG_REPOSITORY_PORT)
    private readonly repository: RocketPoCatalogRepositoryPort,
  ) {}
  begin(input: Parameters<RocketPoCatalogPort['begin']>[0]) {
    const parsed = RocketPoSourceBeginSchema.safeParse(input.request);
    if (!parsed.success) throw new BadRequestException('ROCKET_PO_PLAN_INVALID');
    return this.repository.begin({ ...input, request: parsed.data });
  }
  readAttempt(input: Parameters<RocketPoCatalogPort['readAttempt']>[0]) {
    return this.repository.readAttempt(input);
  }
  readSource(input: Parameters<RocketPoCatalogPort['readSource']>[0]) {
    return this.repository.readSource(input);
  }
  complete(input: Parameters<RocketPoCatalogPort['complete']>[0]) {
    const parsed = RocketPoSourceSubmissionSchema.safeParse(input.submission);
    if (!parsed.success) throw new BadRequestException('ROCKET_PO_EVIDENCE_INVALID');
    return this.repository.complete({ ...input, submission: parsed.data });
  }
  fail(input: Parameters<RocketPoCatalogPort['fail']>[0]) {
    return this.repository.fail(input);
  }
  readComplete(input: Parameters<RocketPoCatalogPort['readComplete']>[0]) {
    return this.repository.readComplete(input);
  }
  listSavedPos(input: Parameters<RocketPoCatalogPort['listSavedPos']>[0]) {
    return this.repository.listSavedPos(input);
  }
  loadSavedCollection(input: Parameters<RocketPoCatalogPort['loadSavedCollection']>[0]) {
    return this.repository.loadSavedCollection(input);
  }
}
