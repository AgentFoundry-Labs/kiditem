'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tags } from 'lucide-react';
import { toast } from 'sonner';
import type { SalesProductMallPriceAdoption } from '@kiditem/shared/sales-product';
import { isApiError } from '@/lib/api-error';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';

const CONFLICT_LABEL: Record<SalesProductMallPriceAdoption['conflictSamples'][number]['reason'], string> = {
  options_disagree: '옵션 · 몰 상품마다 가격이 달라 하나로 정할 수 없음',
};

/**
 * 몰에 걸린 가격이 판매상품 기준과 다른 곳을 알리고, 몰 가격을 그 몰의 몰별 판매가로 저장한다(사장님 2026-09-19 결정).
 * 몰은 건드리지 않는다 — 판매상품 쪽이 몰에 맞춰진다. 한 번 눌러 확인 문구를 보고, 한 번 더 눌러 저장한다.
 */
export function MallPriceAdoptionNotice() {
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: salesProductKeys.mallPriceAdoption(),
    queryFn: salesProductApi.previewMallPriceAdoption,
  });
  const [confirming, setConfirming] = useState(false);
  const apply = useMutation({
    mutationFn: salesProductApi.applyMallPriceAdoption,
    onSuccess: (result) => {
      toast.success(`몰 가격을 몰별 값으로 저장했습니다 — 판매상품 ${result.products.toLocaleString()}개 · 몰 ${result.pairs.toLocaleString()}곳`);
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: salesProductKeys.all });
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : '몰 가격을 저장하지 못했습니다.'),
  });

  const data = preview.data;
  if (!data || (data.pairs === 0 && data.conflicts === 0)) return null;
  const malls = Object.entries(data.byMall).sort((left, right) => right[1] - left[1]);

  return (
    <section
      aria-label="몰 가격 차이"
      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm"
    >
      <div className="min-w-0 flex-1">
        {data.pairs > 0 ? (
          <p className="font-semibold text-sky-900">
            몰 가격이 판매상품 기준과 다른 곳 <span className="tabular-nums">{data.pairs.toLocaleString()}</span>곳
            <span className="font-normal text-sky-800"> (판매상품 {data.products.toLocaleString()}개)</span>
          </p>
        ) : (
          <p className="font-semibold text-sky-900">몰 가격을 모두 몰별 값으로 맞췄습니다.</p>
        )}
        <p className="mt-0.5 text-sky-800">
          저장하면 그 몰의 몰별 판매가가 지금 몰에 걸린 가격이 됩니다. 몰은 건드리지 않고, 앞으로 여기서 가격을 바꿀 때 몰로 보냅니다.
        </p>
        {malls.length > 0 && (
          <p className="mt-1 text-xs text-sky-700">
            {malls.map(([mall, count]) => `${mall} ${count.toLocaleString()}`).join(' · ')}
          </p>
        )}
        {data.conflicts > 0 && (
          <details className="mt-1 text-xs text-sky-800">
            <summary>하나로 정할 수 없어 그대로 두는 곳 {data.conflicts.toLocaleString()}곳</summary>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
              {data.conflictSamples.map((item) => (
                <li key={`${item.code}-${item.mallName}`}>
                  {item.code} {item.name} · {item.mallName} — {CONFLICT_LABEL[item.reason]}
                  {item.prices.length > 0 && ` (${item.prices.map((price) => `${price.toLocaleString()}원`).join(' / ')})`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {data.pairs > 0 && (
        <div className="flex shrink-0 items-center gap-2">
          {confirming && (
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)} disabled={apply.isPending}>
              취소
            </button>
          )}
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
            disabled={apply.isPending}
            onClick={() => (confirming ? apply.mutate() : setConfirming(true))}
          >
            <Tags size={16} aria-hidden />
            {apply.isPending
              ? '저장하는 중…'
              : confirming
                ? `${data.pairs.toLocaleString()}곳 몰별 판매가 저장`
                : '몰 가격을 몰별 값으로 저장'}
          </button>
        </div>
      )}
    </section>
  );
}
