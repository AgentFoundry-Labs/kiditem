'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Ban, Info, Loader2, PackageX, RefreshCw, ShieldAlert } from 'lucide-react';
import type { MallAvailabilityCandidate } from '@kiditem/shared/mall-publishing';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import { mallPublishingApi } from '../_shared/mall-publishing-api';

const PREVIEW_LIMIT = 100;

const STATE_LABEL: Record<MallAvailabilityCandidate['desiredState'], string> = {
  sold_out: '품절',
  on_sale: '판매중',
  suspended: '판매중지',
};

/**
 * 상품 일괄 품절관리.
 *
 * 판매가능 재고 판정은 이미 재고 도메인이 계산해 둔 것을 그대로 읽는다. 이
 * 화면이 더하는 것은 "그 판정을 몰에 그대로 보내도 되는가" 다.
 */
export default function MallAvailabilityPage() {
  const previewQuery = useQuery({
    queryKey: queryKeys.mallPublishing.availabilityPreview({ limit: String(PREVIEW_LIMIT) }),
    queryFn: () => mallPublishingApi.availabilityPreview(PREVIEW_LIMIT),
  });

  const preview = previewQuery.data;
  const candidates = useMemo(() => preview?.candidates ?? [], [preview]);
  const downgraded = candidates.filter(
    (candidate) => candidate.sendable && candidate.effectiveState === 'suspended',
  ).length;
  // 판정은 불러온 창 안에서만 센다. 전체 건수와 섞어 보여주면 "0/387 차단" 같은
  // 읽을 수 없는 조합이 나온다.
  const windowHint = preview && preview.total > preview.loaded
    ? `최근 ${formatNumber(preview.loaded)}건 기준`
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <PackageX className="h-6 w-6 text-slate-600" />
            품절 관리
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            판매 가능 재고가 0인 옵션을 몰에 반영합니다. 해제는 품절과 같은 명령입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void previewQuery.refetch()}
          disabled={previewQuery.isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={previewQuery.isFetching ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="품절 후보" value={preview?.total ?? 0} hint="전체" />
        <SummaryCard label="보낼 수 있음" value={preview?.sendableCount ?? 0} tone="emerald" hint={windowHint} />
        <SummaryCard label="판매중지로 강등" value={downgraded} tone="amber" hint={windowHint} />
        <SummaryCard label="차단됨" value={preview?.blockedCount ?? 0} tone="red" hint={windowHint} />
        {/* 레시피가 없는 옵션은 재고로 판정할 수 없어 후보에 오르지 않는다. 0 으로 숨기지 않고 센다. */}
        <SummaryCard label="레시피 없음" value={preview?.noRecipeCount ?? 0} hint="후보에서 제외" />
      </div>

      {downgraded > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert size={15} className="mt-0.5 flex-none" />
          <div>
            <strong>{formatNumber(downgraded)}건은 품절 대신 판매중지로 보냅니다.</strong> 해당 몰에서
            완전품절은 리스팅 영구삭제이기 때문입니다. 강등은 자동이고, 되돌릴 수 있는 상태만
            남깁니다.
          </div>
        </div>
      ) : null}

      {previewQuery.isError ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-5 text-sm text-red-600">
          <AlertCircle size={15} />
          {isApiError(previewQuery.error) ? previewQuery.error.detail : '품절 후보를 불러오지 못했습니다.'}
        </div>
      ) : previewQuery.isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" />
          불러오는 중
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
          판매 가능 재고가 0인 채널 옵션이 없습니다.
        </div>
      ) : (
        <CandidateTable candidates={candidates} />
      )}

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info size={15} className="mt-0.5 flex-none" />
        <div>
          <strong>지금은 미리보기만 합니다.</strong> 실제 송신은 몰별 어댑터가 붙는 다음 단계에
          열리고, 그때도 보내기 전에 이 표를 먼저 확인하는 순서는 그대로입니다. 보낸 뒤에는
          몰을 다시 조회해 반영을 확인한 것만 완료로 셉니다.
        </div>
      </div>
    </div>
  );
}

function CandidateTable({ candidates }: { candidates: MallAvailabilityCandidate[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold text-slate-500">
            <th className="px-4 py-3">몰</th>
            <th className="px-3 py-3">상품</th>
            <th className="px-3 py-3">옵션</th>
            <th className="px-3 py-3 text-right">판매 가능</th>
            <th className="px-3 py-3">병목 구성품</th>
            <th className="px-3 py-3">보낼 상태</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr
              key={candidate.channelListingOptionId}
              className="border-b border-slate-50 align-top last:border-b-0"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{candidate.mallName}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">{candidate.channelAccountName}</div>
              </td>
              <td className="px-3 py-3 text-slate-700">{candidate.productName}</td>
              <td className="px-3 py-3">
                <div className="text-slate-700">{candidate.optionName}</div>
                {candidate.sellerSku ? (
                  <div className="mt-0.5 text-[11px] text-slate-400">{candidate.sellerSku}</div>
                ) : null}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                {candidate.sellableStock === null ? '계산 불가' : `${formatNumber(candidate.sellableStock)}개`}
              </td>
              <td className="px-3 py-3 text-[11px] text-slate-500">
                {candidate.bottleneckCodes.join(', ') || '-'}
              </td>
              <td className="px-3 py-3">
                {candidate.sendable && candidate.effectiveState ? (
                  <span
                    className={cn(
                      'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
                      candidate.effectiveState === 'sold_out'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700',
                    )}
                    title={
                      candidate.effectiveState === candidate.desiredState
                        ? undefined
                        : '완전품절이 영구삭제인 몰이라 판매중지로 강등했습니다.'
                    }
                  >
                    {STATE_LABEL[candidate.effectiveState]}
                    {candidate.effectiveState === candidate.desiredState ? '' : ' (강등)'}
                  </span>
                ) : (
                  <span
                    className="inline-flex items-start gap-1 text-[11px] text-red-600"
                    title={candidate.blockedReason ?? undefined}
                  >
                    <Ban size={11} className="mt-0.5 flex-none" />
                    <span className="line-clamp-2">{candidate.blockedReason ?? '보낼 수 없음'}</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: number;
  tone?: 'default' | 'emerald' | 'amber' | 'red';
  hint?: string;
}) {
  const toneClass = {
    default: 'text-slate-900',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{formatNumber(value)}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  );
}
