'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import { salesProductKeys } from '@/lib/sales-product-api';
import { sourcingApi } from '../lib/sourcing-api';

const SCRAPE_STATUS_DEBOUNCE_MS = 350;

export function useScrapeUrl() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const routeUrl = searchParams.get('scrapeUrl') ?? '';
  const routeKey = searchParams.get('scrapeKey');
  const routeAttempt = searchParams.get('scrapeAttempt');
  const requestIdentity = useRef<{ url: string; key: string; previousAttemptId: string | null } | null>(null);

  useEffect(() => {
    setScrapeUrl(routeUrl);
    setShowScrapeInput(Boolean(routeUrl));
    requestIdentity.current = routeUrl && routeKey ? { url: routeUrl, key: routeKey, previousAttemptId: routeAttempt } : null;
  }, [routeUrl, routeKey, routeAttempt]);

  const saveCorrelation = (url: string, key: string | null, previousAttemptId: string | null = null) => {
    const query = new URLSearchParams(searchParams.toString());
    if (url) query.set('scrapeUrl', url); else query.delete('scrapeUrl');
    if (key) query.set('scrapeKey', key); else query.delete('scrapeKey');
    if (previousAttemptId) query.set('scrapeAttempt', previousAttemptId); else query.delete('scrapeAttempt');
    router.replace(`${pathname}${query.size ? `?${query}` : ''}`, { scroll: false });
  };

  const [showScrapeInput, setShowScrapeInput] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [statusUrl, setStatusUrl] = useState('');
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeSuccess, setScrapeSuccess] = useState<string | null>(null);
  const scrapeInputRef = useRef<HTMLInputElement>(null);
  const trimmedScrapeUrl = scrapeUrl.trim();

  useEffect(() => {
    if (showScrapeInput && scrapeInputRef.current) {
      scrapeInputRef.current.focus();
    }
  }, [showScrapeInput]);

  useEffect(() => {
    if (!showScrapeInput || !looksLikeSupportedScrapeUrl(trimmedScrapeUrl)) {
      setStatusUrl('');
      return;
    }
    const timeout = window.setTimeout(() => setStatusUrl(trimmedScrapeUrl), SCRAPE_STATUS_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [showScrapeInput, trimmedScrapeUrl]);

  const scrapeStatusQuery = useQuery(collectionSourceStatusQueryOptions({
    queryKey: queryKeys.sourcing.scrapeUrlStatus(statusUrl),
    queryFn: () => sourcingApi.scrapeUrlStatus(statusUrl),
    enabled: Boolean(statusUrl),
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.source.latestAttempt?.state === 'RUNNING' ? 2000 : false,
  }));

  const duplicate = useMemo(() => {
    if (statusUrl !== trimmedScrapeUrl) return null;
    const status = scrapeStatusQuery.data;
    return status?.status === 'collected' ? status : null;
  }, [scrapeStatusQuery.data, statusUrl, trimmedScrapeUrl]);

  const ownerStatus = statusUrl === trimmedScrapeUrl ? scrapeStatusQuery.data?.source ?? null : null;

  // 수집이 끝나면 초안이 생겼다 — 수집상품 목록(판매상품 목록)을 새로 읽는다.
  const latestAttemptState = scrapeStatusQuery.data?.source.latestAttempt?.state ?? null;
  const latestAttemptId = scrapeStatusQuery.data?.source.latestAttempt?.attemptId ?? null;
  const previousAttempt = useRef<{ id: string | null; state: string | null }>({ id: null, state: null });
  useEffect(() => {
    const previous = previousAttempt.current;
    previousAttempt.current = { id: latestAttemptId, state: latestAttemptState };
    if (latestAttemptState !== 'COMPLETE') return;
    if (previous.id === latestAttemptId && previous.state === 'COMPLETE') return;
    void queryClient.invalidateQueries({ queryKey: salesProductKeys.all });
  }, [latestAttemptId, latestAttemptState, queryClient]);

  const scrapeMutation = useMutation({
    mutationFn: ({ url, key }: { url: string; key: string }) => sourcingApi.scrapeUrl(url, key),
    onSuccess: (response, request) => {
      if (response.ok) setScrapeSuccess(response.message);
      else setScrapeError(response.message);
      if (!response.attempt || response.attempt.state !== 'RUNNING') {
        requestIdentity.current = null;
        saveCorrelation(request.url, null);
      }
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all }),
      queryClient.invalidateQueries({ queryKey: salesProductKeys.all }),
    ]),
    onError: (err) => {
      setScrapeError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    },
  });

  const resetInput = () => {
    requestIdentity.current = null;
    saveCorrelation('', null);
    setShowScrapeInput(false);
    setScrapeUrl('');
    setStatusUrl('');
    setScrapeError(null);
    setScrapeSuccess(null);
  };

  const handleSubmit = () => {
    if (!trimmedScrapeUrl || duplicate || scrapeMutation.isPending || ownerStatus?.latestAttempt?.state === 'RUNNING') return;
    setScrapeError(null);
    setScrapeSuccess(null);
    const prior = requestIdentity.current;
    const latest = ownerStatus?.latestAttempt;
    const canReplay = prior?.url === trimmedScrapeUrl && (latest?.state !== 'FAILED' || latest.attemptId === prior.previousAttemptId);
    const key = canReplay ? prior.key : crypto.randomUUID();
    const previousAttemptId = canReplay ? prior.previousAttemptId : latest?.attemptId ?? null;
    requestIdentity.current = { url: trimmedScrapeUrl, key, previousAttemptId };
    saveCorrelation(trimmedScrapeUrl, key, previousAttemptId);
    scrapeMutation.mutate({ url: trimmedScrapeUrl, key });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !scrapeMutation.isPending && !duplicate) {
      handleSubmit();
    } else if (e.key === 'Escape') {
      resetInput();
    }
  };

  return {
    showScrapeInput,
    toggleScrapeInput: () => setShowScrapeInput((v) => !v),
    scrapeUrl,
    setScrapeUrl,
    scrapeError: ownerStatus?.errorMessage ?? scrapeError,
    scrapeSuccess,
    ownerStatus,
    duplicate,
    isCheckingDuplicate: Boolean(statusUrl) && scrapeStatusQuery.isFetching,
    scrapeInputRef,
    isPending: scrapeMutation.isPending || ownerStatus?.latestAttempt?.state === 'RUNNING',
    handleSubmit,
    handleKeyDown,
    resetInput,
  };
}

function looksLikeSupportedScrapeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === '1688.com'
      || hostname.endsWith('.1688.com')
      || hostname === 'alibaba.com'
      || hostname.endsWith('.alibaba.com');
  } catch {
    return false;
  }
}
