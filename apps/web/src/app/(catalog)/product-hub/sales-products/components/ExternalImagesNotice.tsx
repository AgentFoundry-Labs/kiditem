'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageDown } from 'lucide-react';
import { toast } from 'sonner';
import type { SalesProductImageMirrorResult } from '@kiditem/shared/sales-product';
import { isApiError } from '@/lib/api-error';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';

const MAX_ROUNDS = 100;

interface MirrorRun {
  total: number;
  mirrored: number;
  failed: SalesProductImageMirrorResult['failed'];
  failedCount: number;
  remaining: number;
  running: boolean;
}

/**
 * 사방넷을 해지하면 사방넷 서버의 대표 사진이 사라진다. 남은 사진이 있으면 알리고, 한 묶음씩 우리 저장소로 옮긴다 —
 * 못 옮긴 사진은 건너뛰고 끝까지 간다(다시 누르면 처음부터 다시 시도한다).
 */
export function ExternalImagesNotice() {
  const queryClient = useQueryClient();
  const external = useQuery({ queryKey: salesProductKeys.externalImages(), queryFn: salesProductApi.externalImages });
  const [run, setRun] = useState<MirrorRun | null>(null);

  const start = async () => {
    const total = external.data?.images ?? 0;
    let state: MirrorRun = { total, mirrored: 0, failed: [], failedCount: 0, remaining: total, running: true };
    setRun(state);
    let skip = 0;
    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const result = await salesProductApi.mirrorImages(skip);
        state = {
          ...state,
          mirrored: state.mirrored + result.mirrored,
          failed: [...state.failed, ...result.failed].slice(0, 20),
          failedCount: state.failedCount + result.failedCount,
          remaining: result.remaining,
        };
        setRun(state);
        if (result.mirrored + result.failedCount === 0 || result.nextSkip >= result.remaining) break;
        skip = result.nextSkip;
      }
      if (state.failedCount === 0) toast.success(`사진 ${state.mirrored.toLocaleString()}장을 옮겼습니다`);
      else toast.warning(`사진 ${state.mirrored.toLocaleString()}장을 옮겼고 ${state.failedCount.toLocaleString()}장은 옮기지 못했습니다`);
    } catch (error) {
      toast.error(isApiError(error) ? error.message : '사진을 옮기지 못했습니다.');
    } finally {
      setRun({ ...state, running: false });
      void queryClient.invalidateQueries({ queryKey: salesProductKeys.all });
    }
  };

  const images = external.data?.images ?? 0;
  if (!run && images === 0) return null;
  const done = run ? run.total - run.remaining : 0;

  return (
    <section
      aria-label="사방넷 서버 사진"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
    >
      <div className="min-w-0">
        {run?.running ? (
          <p className="font-semibold text-amber-900">
            사진 옮기는 중… <span className="tabular-nums">{done.toLocaleString()} / {run.total.toLocaleString()}</span>
          </p>
        ) : run && run.remaining === 0 ? (
          <p className="font-semibold text-emerald-800">사방넷 서버 사진을 모두 우리 저장소로 옮겼습니다.</p>
        ) : (
          <p className="font-semibold text-amber-900">
            대표 사진 <span className="tabular-nums">{(run?.remaining ?? images).toLocaleString()}</span>장이 아직 사방넷 서버에 있습니다
            {external.data && !run && <> (판매상품 {external.data.products.toLocaleString()}개)</>}
          </p>
        )}
        <p className="mt-0.5 text-amber-800">사방넷을 해지하면 이 사진이 사라집니다. 우리 저장소로 옮기면 주소도 함께 바뀝니다.</p>
        {run && run.failedCount > 0 && (
          <details className="mt-1 text-xs text-amber-800">
            <summary>못 옮긴 사진 {run.failedCount.toLocaleString()}장</summary>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
              {run.failed.map((item) => (
                <li key={item.url} className="truncate">{item.reason} — {item.url}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {!(run && run.remaining === 0) && (
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
          disabled={run?.running || images === 0}
          onClick={() => void start()}
        >
          <ImageDown size={16} aria-hidden />
          {run?.running ? '옮기는 중…' : run ? '남은 사진 다시 옮기기' : '우리 저장소로 옮기기'}
        </button>
      )}
    </section>
  );
}
