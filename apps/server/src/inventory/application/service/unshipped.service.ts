import { Inject, Injectable } from '@nestjs/common';
import { paginationParams } from '../../../common/pagination';
import {
  UNSHIPPED_PORT,
  type ListUnshippedInput,
  type UnshippedListResponse,
  type UnshippedPort,
} from '../port/in/fulfillment/unshipped.port';
import {
  UNSHIPPED_REPOSITORY_PORT,
  type UnshippedRepositoryPort,
} from '../port/out/repository/unshipped.repository.port';

export { UNSHIPPED_PORT } from '../port/in/fulfillment/unshipped.port';

@Injectable()
export class UnshippedService implements UnshippedPort {
  constructor(
    @Inject(UNSHIPPED_REPOSITORY_PORT)
    private readonly repository: UnshippedRepositoryPort,
  ) {}

  async findAll(input: ListUnshippedInput, organizationId: string): Promise<UnshippedListResponse> {
    const { page, limit, skip } = paginationParams(input);
    const minDays = input.minDays ?? 0;

    const { items, total, delayedCount } = await this.repository.list(organizationId, {
      minDays,
      skip,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      summary: { total, delayed: delayedCount },
    };
  }
}
