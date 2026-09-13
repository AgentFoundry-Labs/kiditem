import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  fetchStatisticsTab,
  statisticsTabs,
  type StatisticsTab,
} from './statistics-data';

const SURVIVING_TABS: StatisticsTab[] = [
  'overview',
  'products',
  'categories',
  'grades',
  'pareto',
  'repurchase',
];

describe('statistics data contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes only the surviving statistics tab keys', () => {
    expect(statisticsTabs.map(({ key }) => key)).toEqual(SURVIVING_TABS);
  });

  it.each(SURVIVING_TABS)('loads the %s capability from its matching API type', async (tab) => {
    const payload = tab === 'products' || tab === 'categories' || tab === 'grades'
      ? { rows: [], basis: null }
      : {};
    const getParsed = vi.spyOn(apiClient, 'getParsed').mockResolvedValue(payload);

    const result = await fetchStatisticsTab(tab, '2026-04');

    expect(getParsed).toHaveBeenCalledWith(
      `/api/statistics?type=${tab}&period=2026-04`,
      expect.anything(),
    );
    expect(result).toEqual({ [tab]: payload });
  });
});
