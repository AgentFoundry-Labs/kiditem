export type { PaginatedResponse } from '@kiditem/shared';

export function paginationParams(query: {
  page?: string;
  limit?: string;
}): { page: number; limit: number; skip: number } {
  const page = Math.max(1, parseInt(query.page || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50')));
  return { page, limit, skip: (page - 1) * limit };
}
