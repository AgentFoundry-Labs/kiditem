'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, PackageX } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { mallPublishingApi } from './mall-publishing-api';
import { ListingAvailabilityConfirmationForm } from './ListingAvailabilityExecutionHistory';
import { executeListingAvailability } from './listing-availability-execution';
import {
  MALL_AVAILABILITY_NO_ROUTE,
  MALL_AVAILABILITY_PENDING,
  canSendMallAvailability,
  sendMallAvailability,
  translateMallAvailabilityWarning,
} from './mall-availability-send';
import type { MallAvailabilityCandidate } from '@kiditem/shared/mall-publishing';
import type { ListingAvailabilityExecution } from '@kiditem/shared/sales-product';
import { friendlyError } from '@/lib/api-error';

/**
 * 품절 송신 컨트롤. 상품등록과 품절 관리 두 화면에 같은 것이 선다.
 *
 * 후보는 몰 계정과 외부 상품 단위로 묶는다. 전송 전에 서버 원장에 의도를 고정하고,
 * 새 lease를 받은 경우에만 확장 전송을 시작한다. 전송 결과만으로 몰 반영을 단정하지 않고,
 * 결과가 불명확한 실행은 실제 몰 상태를 확인해 기록할 수 있게 남긴다.
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

interface AvailabilityListing {
  externalListingId: string;
  productNames: string[];
  optionCodes: string[];
}

interface AvailabilityGroup {
  key: string;
  channelAccountId: string;
  channelAccountName: string;
  channelAccountLabel: string;
  mallKey: string;
  mallName: string;
  listings: AvailabilityListing[];
}

interface AvailabilityRunItem {
  key: string;
  groupLabel: string;
  productNames: string[];
  externalListingId: string;
  execution: ListingAvailabilityExecution | null;
  message: string;
}

function buildGroups(candidates: readonly MallAvailabilityCandidate[]): AvailabilityGroup[] {
  const byAccount = new Map<string, {
    channelAccountId: string;
    channelAccountName: string;
    mallKey: string;
    mallName: string;
    listings: Map<string, AvailabilityListing>;
  }>();
  for (const candidate of candidates) {
    if (!candidate.sendable || !candidate.mallProductCode || !candidate.channelAccountId) continue;
    const key = `${candidate.mallKey}:${candidate.channelAccountId}`;
    const group = byAccount.get(key) ?? {
      channelAccountId: candidate.channelAccountId,
      channelAccountName: candidate.channelAccountName,
      mallKey: candidate.mallKey,
      mallName: candidate.mallName,
      listings: new Map<string, AvailabilityListing>(),
    };
    const listing = group.listings.get(candidate.mallProductCode) ?? {
      externalListingId: candidate.mallProductCode,
      productNames: [],
      optionCodes: [],
    };
    if (!listing.productNames.includes(candidate.productName)) listing.productNames.push(candidate.productName);
    if (candidate.mallOptionCode && !listing.optionCodes.includes(candidate.mallOptionCode)) {
      listing.optionCodes.push(candidate.mallOptionCode);
    }
    group.listings.set(candidate.mallProductCode, listing);
    byAccount.set(key, group);
  }
  const groups = [...byAccount.entries()]
    .map(([key, group]) => ({ ...group, key, listings: [...group.listings.values()] }))
    .sort((a, b) => b.listings.length - a.listings.length);
  const accountNameCounts = new Map<string, number>();
  for (const group of groups) {
    const nameKey = `${group.mallKey}:${group.channelAccountName}`;
    accountNameCounts.set(nameKey, (accountNameCounts.get(nameKey) ?? 0) + 1);
  }
  return groups.map((group) => ({
    ...group,
    channelAccountLabel: (accountNameCounts.get(`${group.mallKey}:${group.channelAccountName}`) ?? 0) > 1
      ? `${group.channelAccountName} · ${group.channelAccountId.slice(0, 8)}`
      : group.channelAccountName,
  }));
}

function executionLabel(execution: ListingAvailabilityExecution): string {
  if (execution.status === 'prepared') return '전송 대기';
  if (execution.status === 'executing') return '전송 시도 중 · 결과 확인 필요';
  if (execution.status === 'reconciling') return '몰 결과 확인 필요';
  if (execution.status === 'succeeded') return '확인 완료';
  if (execution.status === 'failed') return '실패';
  return '취소됨';
}

export function showAvailabilityWarnings(warnings: readonly string[]) {
  for (const warning of warnings.slice(0, WARNING_TOASTS)) toast.warning(translateMallAvailabilityWarning(warning));
  if (warnings.length > WARNING_TOASTS) {
    toast.warning(`그 밖에 경고 ${formatNumber(warnings.length - WARNING_TOASTS)}건이 더 있습니다.`);
  }
}

export function MallAvailabilitySend({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [runItems, setRunItems] = useState<AvailabilityRunItem[]>([]);
  const runLock = useRef(false);

  const previewQuery = useQuery({
    queryKey: queryKeys.mallPublishing.availabilityPreview({ limit: String(PREVIEW_LIMIT) }),
    queryFn: () => mallPublishingApi.availabilityPreview(PREVIEW_LIMIT),
  });

  const groups = useMemo(() => buildGroups(previewQuery.data?.candidates ?? []), [previewQuery.data]);

  const preview = previewQuery.data;
  const beyondWindow = preview ? Math.max(0, preview.total - preview.loaded) : 0;
  const sendable = groups.filter((group) => canSendMallAvailability(group.mallKey));
  const blocked = buildGroups((previewQuery.data?.candidates ?? []).filter((candidate) => candidate.sendable))
    .filter((group) => !canSendMallAvailability(group.mallKey));
  if (previewQuery.isLoading || groups.length === 0) return null;

  const run = async (group: AvailabilityGroup) => {
    if (runLock.current || !canSendMallAvailability(group.mallKey)) return;
    runLock.current = true;
    setRunning(group.key);
    setProgress(null);
    setRunItems([]);
    const warnings: string[] = [];
    let sent = 0;
    let failed = 0;
    try {
      for (let index = 0; index < group.listings.length; index += 1) {
        const listing = group.listings[index]!;
        const key = `${group.channelAccountId}:${listing.externalListingId}`;
        setProgress({ done: index, total: group.listings.length });
        try {
          const run = await executeListingAvailability({
            channelAccountId: group.channelAccountId,
            externalListingId: listing.externalListingId,
            mallKey: group.mallKey,
            kind: 'sold_out',
            optionCodes: listing.optionCodes,
            send: (snapshot, executionContext) => {
              if (!canSendMallAvailability(snapshot.mallKey)) {
                throw new Error(`${group.mallName}의 품절 전송 경로가 없습니다.`);
              }
              return sendMallAvailability(snapshot.mallKey, [snapshot.externalListingId], {
                resume: snapshot.kind === 'resume',
                ...(snapshot.optionCodes.length > 0
                  ? { optionCodes: { [snapshot.externalListingId]: snapshot.optionCodes } }
                  : {}),
                executionContext,
              });
            },
          });
          if (run.transportResult) {
            sent += run.transportResult.sent;
            failed += run.transportResult.failed;
            warnings.push(...run.transportResult.warnings);
          }
          const message = run.transportError
            ? `전송 응답 확인 필요 · ${run.transportError}`
            : run.adapterCalled
              ? `전송 시도 ${run.transportResult?.sent ?? 0} · 몰에서 실제 결과 확인 필요`
              : '진행 중인 실행을 확인했습니다 · 다시 보내지 않음';
          setRunItems((current) => [...current, {
            key,
            groupLabel: `${group.mallName} · ${group.channelAccountLabel}`,
            productNames: listing.productNames,
            externalListingId: listing.externalListingId,
            execution: run.execution,
            message,
          }]);
        } catch (error) {
          setRunItems((current) => [...current, {
            key,
            groupLabel: `${group.mallName} · ${group.channelAccountLabel}`,
            productNames: listing.productNames,
            externalListingId: listing.externalListingId,
            execution: null,
            message: error instanceof Error ? error.message : '품절 실행을 기록하지 못했습니다.',
          }]);
        }
        setProgress({ done: index + 1, total: group.listings.length });
      }
      showAvailabilityWarnings(warnings);
      toast.warning(`${group.mallName} · ${group.channelAccountLabel} ${formatNumber(group.listings.length)}개 상품을 처리했습니다.`, {
        description: `전송 시도 ${formatNumber(sent)} · 실패 ${formatNumber(failed)}. 몰 계정과 실제 상태를 확인해야 완료로 기록됩니다.`,
        duration: 10_000,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mallPublishing.all });
    } catch (error) {
      toast.error(friendlyError(error, '품절을 보내지 못했습니다.'));
    } finally {
      runLock.current = false;
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
          key={group.key}
          type="button"
          onClick={() => void run(group)}
          disabled={running !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
            {running === group.key ? <Loader2 size={14} className="animate-spin" /> : null}
            {group.mallName} · {group.channelAccountLabel}
            <span className="tabular-nums text-xs text-slate-400">
              {running === group.key && progress
                ? `${formatNumber(progress.done)}/${formatNumber(progress.total)}건`
                : `${formatNumber(group.listings.length)}건`}
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
            <li key={group.key}>
              {group.mallName} · {group.channelAccountLabel} {formatNumber(group.listings.length)}건 —{' '}
              {MALL_AVAILABILITY_PENDING[group.mallKey] ?? MALL_AVAILABILITY_NO_ROUTE}
            </li>
          ))}
        </ul>
      ) : null}
      {runItems.length > 0 && (
        <section className="mt-3 border-t border-slate-100 pt-3" aria-label="상품별 품절 실행 결과">
          <h3 className="text-xs font-semibold text-slate-600">상품별 실행 결과</h3>
          <ul className="mt-2 max-h-[32rem] space-y-2 overflow-y-auto">
            {runItems.map((item) => (
              <li key={item.key} className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-[11px] font-medium text-slate-800">{item.groupLabel} · {item.productNames.join(', ')}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">몰 상품번호 {item.externalListingId} · {item.message}</p>
                {item.execution && (
                  <>
                    <p className="mt-1 text-[10px] text-slate-500">원장 상태: {executionLabel(item.execution)}</p>
                    {(item.execution.status === 'executing' || item.execution.status === 'reconciling') && (
                      <ListingAvailabilityConfirmationForm execution={item.execution} />
                    )}
                  </>
                )}
                {!item.execution && <p role="alert" className="mt-1 text-[10px] text-red-700">{item.message}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
