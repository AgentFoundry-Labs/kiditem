'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  RANKED_KEYWORD_POOL_UPDATED_EVENT,
  readRankedKeywordPool,
  type RankedKeywordPoolEntry,
  type RankedKeywordPoolSnapshot,
} from './ranked-keyword-pool';
import {
  readTrendKeywordAgentResult,
  TREND_KEYWORD_AGENT_UPDATED_EVENT,
} from '../keywords/lib/trend-keyword-agent-storage';
import type { TrendKeywordAgentResult } from '../keywords/lib/trend-keyword-agent';

export interface DynamicHomeKeyword {
  id: string;
  keyword: string;
  meta: string;
  value: string;
  score: number;
}

export interface DynamicHomeCategory {
  id: string;
  title: string;
  meta: string;
  value: string;
  score: number;
}

export function useSourcingHomeKeywords() {
  const [rankedSnapshot, setRankedSnapshot] = useState<RankedKeywordPoolSnapshot | null>(null);
  const [agentResult, setAgentResult] = useState<TrendKeywordAgentResult | null>(null);

  useEffect(() => {
    const refresh = () => {
      setRankedSnapshot(readRankedKeywordPool());
      setAgentResult(readTrendKeywordAgentResult());
    };

    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(RANKED_KEYWORD_POOL_UPDATED_EVENT, refresh);
    window.addEventListener(TREND_KEYWORD_AGENT_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(RANKED_KEYWORD_POOL_UPDATED_EVENT, refresh);
      window.removeEventListener(TREND_KEYWORD_AGENT_UPDATED_EVENT, refresh);
    };
  }, []);

  return useMemo(() => {
    const rankedKeywords = (rankedSnapshot?.entries ?? []).map(mapRankedEntry);
    const agentKeywords = (agentResult?.candidates ?? []).map((candidate, index) => ({
      id: `agent-${candidate.keyword}`,
      keyword: candidate.keyword,
      meta: candidate.sourceLabels.slice(0, 2).join(' · ') || candidate.grade,
      value: `${candidate.score}점`,
      score: candidate.score + Math.max(0, 30 - index),
    }));

    return {
      hasDynamicKeywords: rankedKeywords.length > 0 || agentKeywords.length > 0,
      rankedSnapshot,
      agentResult,
      rankedKeywords,
      agentKeywords,
      categories: buildCategories(rankedSnapshot?.entries ?? []),
    };
  }, [agentResult, rankedSnapshot]);
}

function mapRankedEntry(entry: RankedKeywordPoolEntry): DynamicHomeKeyword {
  return {
    id: `ranked-${entry.poolRank}-${entry.keyword}`,
    keyword: entry.keyword,
    meta: entry.boardLabel,
    value: `DataLab ${entry.sourceRank}위`,
    score: entry.score,
  };
}

function buildCategories(entries: RankedKeywordPoolEntry[]): DynamicHomeCategory[] {
  const categories = new Map<string, DynamicHomeCategory>();

  for (const entry of entries) {
    const current = categories.get(entry.boardLabel);
    const nextScore = entry.score;
    if (!current) {
      categories.set(entry.boardLabel, {
        id: `category-${entry.boardKey}`,
        title: entry.boardLabel,
        meta: entry.keyword,
        value: '1개',
        score: nextScore,
      });
      continue;
    }

    const count = Number(current.value.replace(/[^0-9]/g, '')) || 0;
    const isStrongerEntry = nextScore > current.score;
    current.value = `${count + 1}개`;
    current.score = Math.max(current.score, nextScore);
    if (isStrongerEntry) current.meta = entry.keyword;
  }

  return [...categories.values()]
    .toSorted((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ko'))
    .slice(0, 10);
}
