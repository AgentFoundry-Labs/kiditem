'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { sourcingApi } from '../lib/sourcing-api';

export function useScrapeUrl() {
  const queryClient = useQueryClient();

  const [showScrapeInput, setShowScrapeInput] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeSuccess, setScrapeSuccess] = useState<string | null>(null);
  const scrapeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showScrapeInput && scrapeInputRef.current) {
      scrapeInputRef.current.focus();
    }
  }, [showScrapeInput]);

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
    setScrapeError(null);
    setScrapeSuccess(null);
  };

  const handleSubmit = () => {
    if (!scrapeUrl.trim()) return;
    setScrapeError(null);
    setScrapeSuccess(null);
    scrapeMutation.mutate(scrapeUrl.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !scrapeMutation.isPending) {
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
    scrapeInputRef,
    isPending: scrapeMutation.isPending,
    handleSubmit,
    handleKeyDown,
    resetInput,
  };
}
