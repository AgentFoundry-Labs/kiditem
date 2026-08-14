'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchWholesale1688Results,
  normalizeWholesale1688ResultQuery,
  wholesale1688ResultsQueryKey,
  type Wholesale1688ResultQuery,
} from '../lib/wholesale-1688-results-api';

export function useWholesale1688Results(input: Wholesale1688ResultQuery) {
  const normalized = normalizeWholesale1688ResultQuery(input);
  return useQuery({
    queryKey: wholesale1688ResultsQueryKey(normalized),
    queryFn: () => fetchWholesale1688Results(normalized),
    enabled: normalized.keywords.length > 0 || normalized.targetIds.length > 0,
  });
}
