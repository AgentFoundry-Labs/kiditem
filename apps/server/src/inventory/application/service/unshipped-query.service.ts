import { Injectable } from '@nestjs/common';
import { paginationParams } from '../../../common/pagination';
import { UnshippedQuery } from '../../adapter/out/prisma/unshipped.query';
import type { UnshippedItemRow } from '../../adapter/out/prisma/unshipped.query';

export type ListUnshippedInput = {
  page?: number;
  limit?: number;
  minDays?: number;
};

export type UnshippedListResponse = {
  items: UnshippedItemRow[];
  total: number;
  page: number;
  limit: number;
  summary: { total: number; delayed: number };
};

@Injectable()
export class UnshippedQueryService {
  constructor(private readonly unshipped: UnshippedQuery) {}

  async findAll(input: ListUnshippedInput, companyId: string): Promise<UnshippedListResponse> {
    const { page, limit, skip } = paginationParams(input);
    const minDays = input.minDays ?? 0;

    const { items, total, delayedCount } = await this.unshipped.listUnshipped(
      companyId,
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
