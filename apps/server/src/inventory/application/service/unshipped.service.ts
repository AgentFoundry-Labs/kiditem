import { Inject, Injectable } from '@nestjs/common';
import { paginationParams } from '../../../common/pagination';
import {
  UNSHIPPED_PORT,
  type ListUnshippedInput,
  type UnshippedListResponse,
  type UnshippedPort,
} from '../port/in/fulfillment/unshipped.port';
import {
  INVENTORY_QUERY_REPOSITORY_PORT,
  type InventoryQueryRepositoryPort,
} from '../port/out/repository/inventory-query.repository.port';

export { UNSHIPPED_PORT } from '../port/in/fulfillment/unshipped.port';

@Injectable()
export class UnshippedService implements UnshippedPort {
  constructor(
    @Inject(INVENTORY_QUERY_REPOSITORY_PORT)
    private readonly query: InventoryQueryRepositoryPort,
  ) {}

  async findAll(input: ListUnshippedInput, organizationId: string): Promise<UnshippedListResponse> {
    const { page, limit, skip } = paginationParams(input);
    const minDays = input.minDays ?? 0;

    const { items, total, delayedCount } = await this.query.listUnshipped(
      organizationId,
      minDays,
      skip,
      limit,
    );

    return {
      items,
      total,
      page,
      limit,
      summary: { total, delayed: delayedCount },
    };
  }
}
