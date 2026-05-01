import type { UnshippedItemRow } from '../out/inventory-query.repository.port';

export const UNSHIPPED_PORT = Symbol('UnshippedPort');

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

export interface UnshippedPort {
  findAll(input: ListUnshippedInput, organizationId: string): Promise<UnshippedListResponse>;
}
