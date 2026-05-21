'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { sourcingApi } from '../lib/sourcing-api';

const SCRAPE_STATUS_DEBOUNCE_MS = 350;

export function useScrapeUrl() {
  const queryClient = useQueryClient();

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

  const scrapeStatusQuery = useQuery({
    queryKey: queryKeys.sourcing.scrapeUrlStatus(statusUrl),
    queryFn: () => sourcingApi.scrapeUrlStatus(statusUrl),
    enabled: Boolean(statusUrl),
    retry: false,
    staleTime: 15_000,
  });

  const duplicate = useMemo(() => {
    if (statusUrl !== trimmedScrapeUrl) return null;
    const status = scrapeStatusQuery.data;
    return status?.status === 'collected' ? status : null;
  }, [scrapeStatusQuery.data, statusUrl, trimmedScrapeUrl]);

  const scrapeMutation = useMutation({
    mutationFn: (url: string) => sourcingApi.scrapeUrl(url),
    onSuccess: (response) => {
      setScrapeSuccess(response.message);
      setScrapeUrl('');
      setTimeout(() => {
        setShowScrapeInput(false);
        setScrapeSuccess(null);
      }, 2000);
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
    },
    onError: (err) => {
      setScrapeError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setTimeout(() => setScrapeError(null), 3000);
    },
  });

  const resetInput = () => {
    setShowScrapeInput(false);
    setScrapeUrl('');
    setStatusUrl('');
    setScrapeError(null);
    setScrapeSuccess(null);
  };

  const handleSubmit = () => {
    if (!trimmedScrapeUrl || duplicate) return;
    setScrapeError(null);
    setScrapeSuccess(null);
    scrapeMutation.mutate(trimmedScrapeUrl);
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
    scrapeError,
    scrapeSuccess,
    duplicate,
    isCheckingDuplicate: Boolean(statusUrl) && scrapeStatusQuery.isFetching,
    scrapeInputRef,
    isPending: scrapeMutation.isPending,
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
