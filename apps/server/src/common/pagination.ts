export type { PaginatedResponse } from '@kiditem/shared';

export function paginationParams(query: {
  page?: string | number;
  limit?: string | number;
}): { page: number; limit: number; skip: number } {
  const rawPage = query.page;
  const rawLimit = query.limit;
  const pageNum = typeof rawPage === 'number' ? rawPage : parseInt(rawPage ?? '1');
  const limitNum = typeof rawLimit === 'number' ? rawLimit : parseInt(rawLimit ?? '50');
  const page = Math.max(1, Number.isFinite(pageNum) ? pageNum : 1);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitNum) ? limitNum : 50));
  return { page, limit, skip: (page - 1) * limit };
}
