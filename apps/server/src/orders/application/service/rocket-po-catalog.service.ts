import { Inject, Injectable } from '@nestjs/common';
import type { RocketPoCatalogPort } from '../port/in/rocket-po-catalog.port';
import {
  ROCKET_PO_CATALOG_REPOSITORY_PORT,
  type RocketPoCatalogRepositoryPort,
} from '../port/out/repository/rocket-po-catalog.repository.port';

/** 로켓 PO 원천의 문. 실행 계약(plan·finalize)과 Supply 읽기가 같은 repository 조합을 거친다. */
@Injectable()
export class RocketPoCatalogService implements RocketPoCatalogPort {
  constructor(
    @Inject(ROCKET_PO_CATALOG_REPOSITORY_PORT)
    private readonly repository: RocketPoCatalogRepositoryPort,
  ) {}
  planOperation(input: Parameters<RocketPoCatalogPort['planOperation']>[0]) {
    return this.repository.planOperation(input);
  }
  publishOperation(...args: Parameters<RocketPoCatalogPort['publishOperation']>) {
    return this.repository.publishOperation(...args);
  }
  readComplete(input: Parameters<RocketPoCatalogPort['readComplete']>[0]) {
    return this.repository.readComplete(input);
  }
  assertPublished(...args: Parameters<RocketPoCatalogPort['assertPublished']>) {
    return this.repository.assertPublished(...args);
  }
  listSavedPos(input: Parameters<RocketPoCatalogPort['listSavedPos']>[0]) {
    return this.repository.listSavedPos(input);
  }
  loadSavedCollection(input: Parameters<RocketPoCatalogPort['loadSavedCollection']>[0]) {
    return this.repository.loadSavedCollection(input);
  }
}
