'use client';

import { useEffect, useState } from 'react';
import {
  readTodayRecommendationSnapshots,
  readTodayRecommendationRows,
  TODAY_RECOMMENDATION_ROWS_UPDATED_EVENT,
  TODAY_RECOMMENDATION_SNAPSHOTS_UPDATED_EVENT,
  type ProductSnapshot,
  type TodayRecommendationRow,
} from '../recommendations/lib/today-recommendations';

export function useTodayRecommendationRows(): TodayRecommendationRow[] {
  const [rows, setRows] = useState<TodayRecommendationRow[]>([]);

  useEffect(() => {
    const refresh = () => setRows(readTodayRecommendationRows());

    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(TODAY_RECOMMENDATION_ROWS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(TODAY_RECOMMENDATION_ROWS_UPDATED_EVENT, refresh);
    };
  }, []);

  return rows;
}

export function useTodayRecommendationSnapshots(): ProductSnapshot[] {
  const [snapshots, setSnapshots] = useState<ProductSnapshot[]>([]);

  useEffect(() => {
    const refresh = () => setSnapshots(readTodayRecommendationSnapshots());

    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(TODAY_RECOMMENDATION_ROWS_UPDATED_EVENT, refresh);
    window.addEventListener(TODAY_RECOMMENDATION_SNAPSHOTS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(TODAY_RECOMMENDATION_ROWS_UPDATED_EVENT, refresh);
      window.removeEventListener(TODAY_RECOMMENDATION_SNAPSHOTS_UPDATED_EVENT, refresh);
    };
  }, []);

  return snapshots;
}
