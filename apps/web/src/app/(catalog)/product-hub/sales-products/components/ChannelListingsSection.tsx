'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { registrationExecutionKeys } from '@/app/(channels)/_shared/registration-execution-api';
import {
  canSendMallPrice,
  MALL_PRICE_SEND_NOTE,
  mallPriceResendAllowed,
} from '../lib/mall-price-send';
import { executeTargetMallPrice, resolveTargetPrice } from '../lib/mall-price-execution';
import { registrationTargetApi, registrationTargetKeys } from '@/lib/registration-target-api';
import { formatWon } from '../lib/sales-product-labels';
import type { RegistrationTarget, SalesProduct } from '@kiditem/shared/sales-product';

interface ListingPriceRow {
  listing: SalesProduct['channelListings'][number];
  candidates: RegistrationTarget[];
  target: RegistrationTarget | undefined;
  /** 이 몰 상품의 옵션 가운데 선택한 등록 설정의 가격과 다른 것. */
  differing: { name: string; mallPrice: number; expected: number }[];
  /** 몰 가격을 모르는(가져올 때 못 읽은) 옵션 수. */
  unknownPrices: number;
  /** 옵션이 하나인 몰 상품의 가격 — 가격 보내기 칸이 쓴다. */
  single: { mallPrice: number | null; expected: number } | null;
}

type SendState =
  | { status: 'confirming' }
  | { status: 'sending' }
  | { status: 'done'; confirmed: boolean; after: number | null; message: string }
  | { status: 'failed'; message: string };

/**
 * 몰에 올라간 상품 — 판매상품에 이어진 몰 상품과, 몰 가격이 단품 최종 판매가(몰별 값 > 옵션 판매가)와 다른 곳.
 * 사방넷 수정송신의 "판매가(송신) ≠ 판매가(상품)" 거르기와 같다. 몰 가격은 가져올 때 읽은 값이고, 몰마다 뜻이 다를 수
 * 있다(할인 전 가격 등) — 다르다고 틀린 것은 아니다.
 */
export function ChannelListingsSection({ product }: { product: SalesProduct }) {
  const [onlyDiffering, setOnlyDiffering] = useState(false);
  const queryClient = useQueryClient();
  const targetsQuery = useQuery({
    queryKey: registrationTargetKeys.list(product.id),
    queryFn: () => registrationTargetApi.list(product.id),
  });
  const inFlight = useRef(new Set<string>());
  const requestKeys = useRef(new Map<string, string>());
  const rows = useMemo<ListingPriceRow[]>(() => {
    const optionById = new Map(product.options.map((option) => [option.id, option]));
    return product.channelListings.map((listing) => {
      // 상품 × 몰 계정당 등록 설정은 하나뿐이다(사용자 결정 01:12) — 고를 것이 없다.
      const resolution = resolveTargetPrice(listing, targetsQuery.data ?? []);
      const candidates = resolution.candidates;
      const target = candidates[0];
      const differing: ListingPriceRow['differing'] = [];
      let unknownPrices = 0;
      let single: ListingPriceRow['single'] = null;
      for (const channelOption of listing.options) {
        const option = channelOption.salesProductOptionId ? optionById.get(channelOption.salesProductOptionId) : undefined;
        if (!option) continue;
        if (channelOption.salePrice === null) {
          unknownPrices += 1;
          continue;
        }
        const resolved = target?.resolved.options.find(row => row.salesProductOptionId === option.id);
        const expected = resolved?.salePrice ?? (candidates.length === 0 ? option.salePrice : undefined);
        // 아직 가격을 정하지 않은 초안 옵션(null)은 비교할 기준이 없다 — 모르는 값과 같게 건너뛴다.
        if (expected == null) continue;
        if (listing.options.length === 1) single = { mallPrice: channelOption.salePrice, expected };
        if (channelOption.salePrice !== expected) {
          differing.push({
            name: channelOption.itemName || option.values.join(' / ') || '단품',
            mallPrice: channelOption.salePrice,
            expected,
          });
        }
      }
      if (listing.options.length === 1 && !single) {
        const option = optionById.get(listing.options[0]!.salesProductOptionId ?? '');
        const expected = option && target
          ? target.resolved.options.find((row) => row.salesProductOptionId === option.id)?.salePrice
          : candidates.length === 0 ? option?.salePrice : undefined;
        if (option && expected != null) {
          single = {
            mallPrice: null,
            expected,
          };
        }
      }
      return { listing, differing, unknownPrices, single, candidates, target };
    });
  }, [product, targetsQuery.data]);
  const [sendStates, setSendStates] = useState<Record<string, SendState>>({});

  const sendPrice = async (
    listing: SalesProduct['channelListings'][number],
    target: RegistrationTarget | undefined,
    expectedPrice: number,
  ) => {
    if (inFlight.current.has(listing.id)) return;
    if (!listing.channelAccountId) {
      toast.error('몰 계정을 확인할 수 없어 가격을 보내지 않았습니다.');
      return;
    }
    inFlight.current.add(listing.id);
    const key = `${listing.id}:${target?.id ?? 'common'}:${target?.version ?? 0}`;
    const idempotencyKey = requestKeys.current.get(key) ?? crypto.randomUUID();
    requestKeys.current.set(key, idempotencyKey);
    setSendStates((current) => ({ ...current, [listing.id]: { status: 'sending' } }));
    let executionTargetId = target?.id;
    try {
      const result = await executeTargetMallPrice({
        salesProductId: product.id,
        channelAccountId: listing.channelAccountId,
        expectedPrice,
        listingId: listing.id,
        mallKey: listing.mallKey,
        idempotencyKey,
      });
      executionTargetId = result.execution.targetId;
      const confirmed = result.decision?.confirmed === true;
      const message = result.decision?.message ?? '이 상품의 전송 실행이 남아 있습니다. 등록 설정의 실행 기록에서 결과를 확인해주세요.';
      if (result.execution.status === 'succeeded' || result.execution.status === 'failed') requestKeys.current.delete(key);
      setSendStates((current) => ({ ...current, [listing.id]: {
        status: result.decision?.outcome === 'not_submitted' ? 'failed' : 'done',
        confirmed, after: result.decision?.after ?? null, message,
      } }));
      if (confirmed) toast.success(message);
      else toast.warning(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : '가격을 보내지 못했습니다.';
      setSendStates((current) => ({ ...current, [listing.id]: { status: 'failed', message } }));
      toast.error(message);
    } finally {
      inFlight.current.delete(listing.id);
      if (executionTargetId) {
        void queryClient.invalidateQueries({ queryKey: registrationExecutionKeys.targetHistory(executionTargetId) });
      }
    }
  };

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        아직 이 판매상품에 이어진 몰 상품이 없습니다. 사방넷 쇼핑몰상품수정 다운로드를 가져오면 코드가 같은 몰 상품이 이어집니다.
      </p>
    );
  }

  const differingCount = rows.filter((row) => row.differing.length > 0).length;
  const shown = onlyDiffering ? rows.filter((row) => row.differing.length > 0) : rows;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-slate-600">
          몰 상품 <span className="tabular-nums">{rows.length.toLocaleString()}</span>개
          {differingCount > 0 && (
            <> · 가격이 선택한 설정과 다른 곳 <span className="font-semibold tabular-nums text-amber-700">{differingCount.toLocaleString()}</span>개</>
          )}
        </p>
        {differingCount > 0 && (
          <label className="inline-flex items-center gap-1.5 text-slate-600">
            <input type="checkbox" checked={onlyDiffering} onChange={(event) => setOnlyDiffering(event.target.checked)} />
            다른 곳만
          </label>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-28 px-3 py-2 text-left font-semibold">쇼핑몰</th>
              <th className="w-32 px-2 py-2 text-left font-semibold">몰 상품코드</th>
              <th className="px-2 py-2 text-left font-semibold">몰 상품명</th>
              <th className="w-24 px-2 py-2 text-left font-semibold">상태</th>
              <th className="w-56 px-3 py-2 text-left font-semibold">몰 가격 · 등록 설정 기준</th>
              <th className="w-44 px-3 py-2 text-right font-semibold">가격 보내기</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ listing, differing, unknownPrices, single, candidates, target }) => (
              <tr key={listing.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-2 font-medium text-slate-800">{listing.mallName}</td>
                <td className="px-2 py-2 font-mono text-xs text-slate-500">{listing.externalId}</td>
                <td className="max-w-0 px-2 py-2">
                  <span className="block truncate text-slate-700" title={listing.displayName ?? undefined}>{listing.displayName}</span>
                </td>
                <td className="px-2 py-2 text-xs text-slate-500">{listing.status ?? ''}</td>
                <td className={cn('px-3 py-2 text-xs tabular-nums', differing.length > 0 ? 'text-amber-800' : 'text-slate-500')}>
                  {targetsQuery.isPending ? '등록 설정을 읽는 중…' : targetsQuery.isError ? '등록 설정 조회 실패' : candidates.length === 0 ? (
                    listing.options.length === 1 && single ? `공통 판매가 ${formatWon(single.expected)}` : '공통 판매가 기준'
                  ) : (
                    <span className="mb-1 block text-slate-500">{target?.displayName || target?.resolved.name || '등록 설정 1개'}</span>
                  )}
                  {!target ? null : differing.length > 0 ? (
                    <ul className="space-y-0.5">
                      {differing.slice(0, 3).map((item) => (
                        <li key={`${item.name}-${item.mallPrice}`}>
                          {listing.options.length > 1 && <span className="text-slate-500">{item.name} · </span>}
                          몰 {formatWon(item.mallPrice)} · 기준 {formatWon(item.expected)}
                        </li>
                      ))}
                      {differing.length > 3 && <li>외 {differing.length - 3}개 옵션</li>}
                    </ul>
                  ) : unknownPrices > 0 ? (
                    '몰 가격을 모릅니다'
                  ) : listing.options.some((option) => option.salesProductOptionId) ? (
                    '같음'
                  ) : (
                    '옵션이 아직 안 이어짐'
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  {(target || candidates.length === 0) ? <PriceSendCell
                    listing={listing}
                    single={single}
                    state={sendStates[listing.id]}
                    onConfirm={() => setSendStates((current) => ({ ...current, [listing.id]: { status: 'confirming' } }))}
                    onCancel={() => setSendStates(({ [listing.id]: _dropped, ...rest }) => rest)}
                    onSend={(price) => void sendPrice(listing, target, price)}
                  /> : <span className="text-slate-400">등록 설정 선택 필요</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        몰 가격은 몰에서 가져올 때 읽은 값입니다. 몰마다 가격의 뜻이 다를 수 있습니다(할인 전 가격을 주는 몰 등). 가격
        보내기는 선택한 등록 설정의 가격을 그 몰에 보내고 몰을 다시 읽어 확인합니다 — 지금은 카카오 톡스토어 · 키즈노트가 됩니다.
      </p>
    </div>
  );
}

/** 한 몰 상품의 가격 보내기 — 한 번 눌러 보낼 값을 보고, 한 번 더 눌러 보낸다. 옵션이 여럿인 몰 상품은 옵션마다라 막는다. */
function PriceSendCell({
  listing,
  single,
  state,
  onConfirm,
  onCancel,
  onSend,
}: {
  listing: SalesProduct['channelListings'][number];
  single: ListingPriceRow['single'];
  state: SendState | undefined;
  onConfirm: () => void;
  onCancel: () => void;
  onSend: (price: number) => void;
}) {
  if (!canSendMallPrice(listing.mallKey)) return <span className="text-slate-300">아직 안 됨</span>;
  if (!single) return <span className="text-slate-400">옵션마다 가격</span>;
  if (single.mallPrice === single.expected && !mallPriceResendAllowed(listing.mallKey) && !state) {
    return <span className="text-slate-400">같은 가격</span>;
  }
  const note = MALL_PRICE_SEND_NOTE[listing.mallKey];
  if (state?.status === 'sending') return <span className="text-slate-500">보내는 중…</span>;
  if (state?.status === 'done') {
    return <span className={state.confirmed ? 'text-emerald-700' : 'text-amber-700'}>{state.message}</span>;
  }
  if (state?.status === 'confirming') {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        {note && <span className="max-w-[14rem] text-right text-amber-700">{note}</span>}
        <span className="inline-flex items-center gap-1">
          <button type="button" className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100" onClick={onCancel}>취소</button>
          <button
            type="button"
            className="rounded bg-purple-600 px-2 py-0.5 font-semibold text-white hover:bg-purple-700"
            onClick={() => onSend(single.expected)}
            title={single.mallPrice !== null ? `몰 ${formatWon(single.mallPrice)} → ${formatWon(single.expected)}` : undefined}
          >
            {formatWon(single.expected)} 보내기
          </button>
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        className="rounded border border-purple-200 px-2 py-0.5 font-medium text-purple-700 hover:bg-purple-50"
        onClick={onConfirm}
        title={single.mallPrice === single.expected ? '몰 가격과 같습니다 — 다시 보내 몰에서 확인합니다' : undefined}
      >
        가격 보내기
      </button>
      {state?.status === 'failed' && <span className="text-red-600">{state.message}</span>}
    </span>
  );
}
