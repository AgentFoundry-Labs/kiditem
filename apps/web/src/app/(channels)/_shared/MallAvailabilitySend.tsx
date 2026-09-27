'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, PackageX } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { mallPublishingApi } from './mall-publishing-api';
import {
  MALL_AVAILABILITY_BATCH_MAX,
  MALL_AVAILABILITY_NO_ROUTE,
  MALL_AVAILABILITY_PENDING,
  canSendMallAvailability,
  sendMallAvailability,
  translateMallAvailabilityWarning,
  type MallAvailabilityRun,
} from './mall-availability-send';
import { RegistrationOperationResolution } from './RegistrationOperationResolution';
import type { MallAvailabilityCandidate } from '@kiditem/shared/mall-publishing';
import { friendlyError } from '@/lib/api-error';

/**
 * 품절 송신 컨트롤. 상품등록과 품절 관리 두 화면에 같은 것이 선다.
 *
 * 후보는 몰 계정 단위로 묶고, 계정 하나 = 품절 실행 하나다(`channels.registration` sold_out, 리스팅 500개씩).
 * 서버 plan이 옵션 id를 리스팅·외부 id로 풀고 잠그며, 확장 몰 쓰기 모듈이 보낸다. 보낸 결과만으로 몰 반영을
 * 단정하지 않는다 — 몰에서 확인하지 못한 실행은 확인 필요로 남아 그 자리에서 결과를 기록한다.
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
  /** 이 몰 상품에서 품절로 보낼 우리 몰 옵션 행(`ChannelListingOption.id`). */
  channelListingOptionIds: string[];
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
  listingCount: number;
  run: MallAvailabilityRun | null;
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
      channelListingOptionIds: [],
    };
    if (!listing.productNames.includes(candidate.productName)) listing.productNames.push(candidate.productName);
    if (candidate.channelListingOptionId && !listing.channelListingOptionIds.includes(candidate.channelListingOptionId)) {
      listing.channelListingOptionIds.push(candidate.channelListingOptionId);
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
    const groupLabel = `${group.mallName} · ${group.channelAccountLabel}`;
    try {
      const listings = group.listings.filter((listing) => listing.channelListingOptionIds.length > 0);
      for (let start = 0; start < listings.length; start += MALL_AVAILABILITY_BATCH_MAX) {
        const batch = listings.slice(start, start + MALL_AVAILABILITY_BATCH_MAX);
        const key = `${group.key}:${start}`;
        setProgress({ done: start, total: listings.length });
        try {
          const result = await sendMallAvailability({
            mallKey: group.mallKey,
            channelAccountId: group.channelAccountId,
            action: 'sold_out',
            items: batch.map((listing) => ({ channelListingOptionIds: listing.channelListingOptionIds })),
          });
          const warnings = result.operation.result?.fill.warnings ?? [];
          showAvailabilityWarnings(warnings);
          setRunItems((current) => [...current, {
            key,
            groupLabel,
            listingCount: batch.length,
            run: result,
            message: result.operation.message ?? result.operation.label,
          }]);
        } catch (error) {
          setRunItems((current) => [...current, {
            key,
            groupLabel,
            listingCount: batch.length,
            run: null,
            message: friendlyError(error, '품절 실행을 시작하지 못했습니다.') ?? '품절 실행을 시작하지 못했습니다.',
          }]);
        }
        setProgress({ done: Math.min(start + batch.length, listings.length), total: listings.length });
      }
      toast.warning(`${groupLabel} ${formatNumber(listings.length)}개 상품의 품절 실행을 마쳤습니다.`, {
        description: '몰에서 확인한 것만 완료로 기록됩니다. 확인 필요로 남은 실행은 아래에서 결과를 기록하세요.',
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
        <section className="mt-3 border-t border-slate-100 pt-3" aria-label="품절 실행 결과">
          <h3 className="text-xs font-semibold text-slate-600">품절 실행 결과</h3>
          <ul className="mt-2 max-h-[32rem] space-y-2 overflow-y-auto">
            {runItems.map((item) => (
              <li key={item.key} className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-[11px] font-medium text-slate-800">
                  {item.groupLabel} · 상품 {formatNumber(item.listingCount)}개
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">{item.message}</p>
                {item.run?.operation ? (
                  <RegistrationOperationResolution className="mt-1.5" read={item.run.operation} />
                ) : (
                  <p role="alert" className="mt-1 text-[10px] text-red-700">{item.message}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
