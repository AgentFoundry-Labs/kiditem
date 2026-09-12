import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useBatchAnalysis } from './useBatchAnalysis';
import type { ThumbnailAnalysisResult } from '@kiditem/shared/ai';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ANALYZE_PATH = '/api/thumbnail-analysis/analyze-batch';
const rows: ThumbnailAnalysisResult[] = Array.from({ length: 16 }, (_, index) => ({
  id: `analysis-${index}`, contentWorkspaceId: `workspace-${index}`,
  productName: `상품 ${index}`, imageUrl: `https://images.example/${index}.jpg`,
  overallScore: 80, grade: 'A', scores: null, issues: [], suggestions: [],
  method: 'ai', analyzed: true, qualityAnalyzed: true, complianceAnalyzed: true,
  complianceGrade: 'PASS', complianceScores: null,
}));

function setup(respond: (body: { contentWorkspaceIds: string[]; scope: string }, init: RequestInit) => Response | Promise<Response>) {
  const requests: Array<{ path: string; body: unknown; signal: AbortSignal | null | undefined }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, 'http://localhost').pathname;
    const body = JSON.parse(String(init.body ?? '{}'));
    requests.push({ path, body, signal: init.signal });
    return path === ANALYZE_PATH ? respond(body, init) : Response.json({});
  }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.thumbnailAnalysis.all, { cached: true });
  const hook = renderHook(() => useBatchAnalysis(), {
    wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children),
  });
  return { hook, queryClient, requests };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-06T00:00:00Z')); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('thumbnail batch direct API boundary', () => {
  it('keeps 15-row chunks, the two-second delay, progress and callbacks without Operation alerts', async () => {
    const { hook, queryClient, requests } = setup(({ contentWorkspaceIds }) => Response.json(
      rows.filter((row) => contentWorkspaceIds.includes(row.contentWorkspaceId!)),
    ));
    const onResults = vi.fn();
    const onComplete = vi.fn();
    let completion!: Promise<void>;
    await act(async () => {
      completion = hook.result.current.run([...rows, { ...rows[0]!, imageUrl: null }], 'quality', { onResults, onComplete });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hook.result.current.isBatchRunning).toBe(true);
    expect(hook.result.current.batchDone).toBe(15);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ path: ANALYZE_PATH, body: {
      contentWorkspaceIds: rows.slice(0, 15).map((row) => row.contentWorkspaceId), scope: 'quality',
    } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_999); });
    expect(requests).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); await completion; });
    expect(requests.map(({ path }) => path)).toEqual([ANALYZE_PATH, ANALYZE_PATH]);
    expect(onResults.mock.calls).toEqual([[rows.slice(0, 15)], [rows.slice(15)]]);
    expect(onComplete).toHaveBeenCalledWith(rows, rows);
    expect(hook.result.current).toMatchObject({ isBatchRunning: false, batchDone: 16, batchTotal: 16 });
    expect(queryClient.getQueryState(queryKeys.thumbnailAnalysis.all)?.isInvalidated).toBe(true);
  });

  it.each([true, false])('continues after failed chunks and reports partial/all failure (last succeeds=%s)', async (lastSucceeds) => {
    let calls = 0;
    const { hook, requests } = setup(() => ++calls === 2 && lastSucceeds
      ? Response.json(rows.slice(15))
      : Response.json({ message: 'vision failed' }, { status: 500 }));
    const onComplete = vi.fn();
    let completion!: Promise<void>;
    await act(async () => {
      completion = hook.result.current.run(rows, 'all', { onComplete });
      await vi.advanceTimersByTimeAsync(2_000);
      await completion;
    });
    expect(requests.map(({ path }) => path)).toEqual([ANALYZE_PATH, ANALYZE_PATH]);
    expect(hook.result.current).toMatchObject({ isBatchRunning: false, batchDone: 16 });
    if (lastSucceeds) {
      expect(onComplete).toHaveBeenCalledWith(rows.slice(15), rows);
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('성공 1/16개'));
    } else {
      expect(onComplete).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('AI 분류 실패'));
    }
  });

  it('aborts the in-flight API request and skips remaining chunks and completion', async () => {
    const { hook, requests } = setup((_body, init) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    const onComplete = vi.fn();
    let completion!: Promise<void>;
    await act(async () => {
      completion = hook.result.current.run(rows, 'compliance', { onComplete });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(requests.map(({ path }) => path)).toEqual([ANALYZE_PATH]);
    await act(async () => { hook.result.current.cancel(); await completion; });
    expect(requests[0]!.signal?.aborted).toBe(true);
    expect(requests).toHaveLength(1);
    expect(hook.result.current).toMatchObject({ isBatchRunning: false, batchDone: 0 });
    expect(onComplete).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('배치 분류를 중단했습니다');
  });
});
