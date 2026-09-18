'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, PackageX } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { recordMallOperationOutcome } from '@/lib/mall-operation-outcomes-api';
import { mallPublishingApi } from './mall-publishing-api';
import {
  MALL_AVAILABILITY_NO_ROUTE,
  MALL_AVAILABILITY_PENDING,
  availabilityOutcome,
  canSendMallAvailability,
  sendMallAvailability,
} from './mall-availability-send';

/**
 * 품절 송신 컨트롤. 상품등록과 품절 관리 두 화면에 같은 것이 선다.
 *
 * 사방넷·몰관리자 가져오기 컨트롤과 같은 방식이다 — 몰을 아는 것은 확장뿐이고,
 * 이 컴포넌트는 후보를 몰별로 묶어 개수를 세고 버튼을 세울 뿐이다.
 *
 * 누르면 **끝까지 보낸다.** 사람이 몰에 다시 들어가지 않는다.
 */

/**
 * 후보 전부를 읽는다.
 *
 * 창을 좁히면 그 창에 안 든 몰은 버튼조차 서지 않아 통째로 빠진다 — 표가 100건만
 * 보여주던 때 키드키즈·아이스크림몰이 정확히 그렇게 사라졌다. 그래도 상한은 있으므로
 * 남은 건수를 화면이 말한다.
 */
const PREVIEW_LIMIT = 3_000;

/** 경고는 앞의 몇 개만 띄운다. 나머지는 개수로 말한다 — 상품마다 한 장씩 띄우면 화면이 덮인다. */
const WARNING_TOASTS = 3;

export function showAvailabilityWarnings(warnings: readonly string[]) {
  for (const warning of warnings.slice(0, WARNING_TOASTS)) toast.warning(warning);
  if (warnings.length > WARNING_TOASTS) {
    toast.warning(`그 밖에 경고 ${formatNumber(warnings.length - WARNING_TOASTS)}건이 더 있습니다.`);
  }
}

export function MallAvailabilitySend({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const previewQuery = useQuery({
    queryKey: queryKeys.mallPublishing.availabilityPreview({ limit: String(PREVIEW_LIMIT) }),
    queryFn: () => mallPublishingApi.availabilityPreview(PREVIEW_LIMIT),
  });

  const groups = useMemo(() => {
    const byMall = new Map<string, { mallName: string; codes: string[]; optionCodes: Record<string, string[]> }>();
    for (const candidate of previewQuery.data?.candidates ?? []) {
      // 보낼 수 없다고 판정된 줄은 빼둔다. 매니페스트가 막은 것을 화면이 되살리지 않는다.
      if (!candidate.sendable || !candidate.mallProductCode) continue;
      const group = byMall.get(candidate.mallKey)
        ?? { mallName: candidate.mallName, codes: [], optionCodes: {} };
      group.codes.push(candidate.mallProductCode);
      // 옵션 단위로 보내는 몰(쿠팡 윙 = 옵션 재고 0)은 이 옵션만 바꾼다. 상품 단위 몰은 쓰지 않는다.
      if (candidate.mallOptionCode) {
        (group.optionCodes[candidate.mallProductCode] ??= []).push(candidate.mallOptionCode);
      }
      byMall.set(candidate.mallKey, group);
    }
    return [...byMall.entries()]
      .map(([mallKey, group]) => ({ mallKey, ...group, codes: [...new Set(group.codes)] }))
      .sort((a, b) => b.codes.length - a.codes.length);
  }, [previewQuery.data]);

  const preview = previewQuery.data;
  const beyondWindow = preview ? Math.max(0, preview.total - preview.loaded) : 0;
  const sendable = groups.filter((group) => canSendMallAvailability(group.mallKey));
  const blocked = groups.filter((group) => !canSendMallAvailability(group.mallKey));
  if (previewQuery.isLoading || groups.length === 0) return null;

  const run = async (
    mallKey: string,
    mallName: string,
    codes: string[],
    optionCodes: Record<string, string[]>,
  ) => {
    if (!canSendMallAvailability(mallKey)) return;
    setRunning(mallKey);
    setProgress(null);
    try {
      const result = await sendMallAvailability(mallKey, codes, {
        optionCodes,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      showAvailabilityWarnings(result.warnings);
      // 보낸 것은 성공이 아니라 `attention` 이다 — 몰을 다시 읽어 확인된 것만 성공이다.
      const recorded = availabilityOutcome(result);
      void recordMallOperationOutcome({
        mallKey,
        operation: 'availability_stage',
        outcome: recorded.outcome,
        reasonCode: recorded.reasonCode,
        itemCount: result.sent,
        failedCount: result.failed,
        warningCount: result.warnings.length,
      });
      toast.success(
        `${mallName} ${formatNumber(result.sent)}건을 품절로 보냈습니다.`,
        {
          description: result.requestOnly
            ? '온채널은 관리자 승인을 거칩니다 — 승인 전까지 반영이 아닙니다.'
            : recorded.outcome === 'succeeded'
              ? `${mallName}에서 다시 읽어 ${formatNumber(result.confirmed ?? 0)}건 모두 품절로 바뀐 것을 확인했습니다.`
              : '반영은 몰을 다시 가져와야 확인됩니다.',
          duration: 10_000,
        },
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.mallPublishing.all });
    } catch (error) {
      void recordMallOperationOutcome({
        mallKey,
        operation: 'availability_stage',
        outcome: 'failed',
        reasonCode: 'extension_unavailable',
        itemCount: codes.length,
      });
      toast.error(error instanceof Error ? error.message : '품절을 보내지 못했습니다.');
    } finally {
      setRunning(null);
      setProgress(null);
    }
  };

  return (
    <div className={compact ? '' : 'rounded-xl border border-slate-200 bg-white p-4'}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <PackageX size={13} />
        재고 0 인 상품 품절 보내기
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sendable.map((group) => (
          <button
            key={group.mallKey}
            type="button"
            onClick={() => void run(group.mallKey, group.mallName, group.codes, group.optionCodes)}
            disabled={running !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {running === group.mallKey ? <Loader2 size={14} className="animate-spin" /> : null}
            {group.mallName}
            <span className="tabular-nums text-xs text-slate-400">
              {running === group.mallKey && progress
                ? `${formatNumber(progress.done)}/${formatNumber(progress.total)}건`
                : `${formatNumber(group.codes.length)}건`}
            </span>
          </button>
        ))}
        {sendable.length === 0 ? (
          <span className="text-xs text-slate-400">보낼 수 있는 몰의 품절 후보가 없습니다.</span>
        ) : null}
      </div>
      {/* 창 밖에 남은 후보를 숨기지 않는다. 버튼의 숫자가 전부인 것처럼 읽히면 안 된다. */}
      {beyondWindow > 0 ? (
        <p className="mt-2 text-[11px] text-amber-700">
          후보 {formatNumber(beyondWindow)}건이 이 창 밖에 있습니다. 한 번 보낸 뒤 새로고침하면 다음 건이 올라옵니다.
        </p>
      ) : null}
      {/* 경로가 없는 몰을 숨기지 않는다. 왜 버튼이 없는지 그 자리에서 말한다. */}
      {blocked.length > 0 ? (
        <ul className="mt-3 space-y-0.5 text-[11px] text-slate-400">
          {blocked.map((group) => (
            <li key={group.mallKey}>
              {group.mallName} {formatNumber(group.codes.length)}건 —{' '}
              {MALL_AVAILABILITY_PENDING[group.mallKey] ?? MALL_AVAILABILITY_NO_ROUTE}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
