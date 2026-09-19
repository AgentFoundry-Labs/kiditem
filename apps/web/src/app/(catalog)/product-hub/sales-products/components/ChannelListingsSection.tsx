'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { salesProductMallPrice, type SalesProduct } from '@kiditem/shared/sales-product';
import { cn } from '@/lib/utils';
import { canSendMallPrice, sendMallPrice } from '../lib/mall-price-send';
import { formatWon } from '../lib/sales-product-labels';

interface ListingPriceRow {
  listing: SalesProduct['channelListings'][number];
  /** 이 몰 상품의 옵션 가운데 판매상품 기준 가격과 다른 것. */
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
 * 몰에 올라간 상품 — 판매상품에 이어진 몰 상품과, 몰 가격이 판매상품 기준 가격(몰별 값 > 판매가 + 추가금액)과 다른 곳.
 * 사방넷 수정송신의 "판매가(송신) ≠ 판매가(상품)" 거르기와 같다. 몰 가격은 가져올 때 읽은 값이고, 몰마다 뜻이 다를 수
 * 있다(할인 전 가격 등) — 다르다고 틀린 것은 아니다.
 */
export function ChannelListingsSection({ product }: { product: SalesProduct }) {
  const [onlyDiffering, setOnlyDiffering] = useState(false);
  const rows = useMemo<ListingPriceRow[]>(() => {
    const optionById = new Map(product.options.map((option) => [option.id, option]));
    const overrideByAccount = new Map(product.channelOverrides.map((override) => [override.channelAccountId, override]));
    return product.channelListings.map((listing) => {
      const override = overrideByAccount.get(listing.channelAccountId);
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
        const expected = salesProductMallPrice({ salePrice: product.salePrice, extraPrice: option.extraPrice, override });
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
        if (option) {
          single = {
            mallPrice: null,
            expected: salesProductMallPrice({ salePrice: product.salePrice, extraPrice: option.extraPrice, override }),
          };
        }
      }
      return { listing, differing, unknownPrices, single };
    });
  }, [product]);
  const [sendStates, setSendStates] = useState<Record<string, SendState>>({});

  const sendPrice = async (listing: SalesProduct['channelListings'][number], price: number, ifPrice: number | null) => {
    setSendStates((current) => ({ ...current, [listing.id]: { status: 'sending' } }));
    try {
      const result = await sendMallPrice(listing.mallKey, [{ code: listing.externalId, price, ifPrice }]);
      const answer = result.results[0];
      const confirmed = result.confirmed > 0 && answer?.confirmed === true;
      const message = confirmed
        ? `${listing.mallName}에서 ${formatWon(answer?.after ?? price)} 확인`
        : result.warnings[0] ?? `${listing.mallName}에 보냈지만 몰에서 가격을 확인하지 못했습니다.`;
      setSendStates((current) => ({ ...current, [listing.id]: { status: 'done', confirmed, after: answer?.after ?? null, message } }));
      if (confirmed) toast.success(message);
      else toast.warning(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : '가격을 보내지 못했습니다.';
      setSendStates((current) => ({ ...current, [listing.id]: { status: 'failed', message } }));
      toast.error(message);
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
            <> · 가격이 판매상품 기준과 다른 곳 <span className="font-semibold tabular-nums text-amber-700">{differingCount.toLocaleString()}</span>개</>
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
              <th className="w-56 px-3 py-2 text-left font-semibold">몰 가격 · 판매상품 기준</th>
              <th className="w-44 px-3 py-2 text-right font-semibold">가격 보내기</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ listing, differing, unknownPrices, single }) => (
              <tr key={listing.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-2 font-medium text-slate-800">{listing.mallName}</td>
                <td className="px-2 py-2 font-mono text-xs text-slate-500">{listing.externalId}</td>
                <td className="max-w-0 px-2 py-2">
                  <span className="block truncate text-slate-700" title={listing.displayName ?? undefined}>{listing.displayName}</span>
                </td>
                <td className="px-2 py-2 text-xs text-slate-500">{listing.status ?? ''}</td>
                <td className={cn('px-3 py-2 text-xs tabular-nums', differing.length > 0 ? 'text-amber-800' : 'text-slate-500')}>
                  {differing.length > 0 ? (
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
                  <PriceSendCell
                    listing={listing}
                    single={single}
                    state={sendStates[listing.id]}
                    onConfirm={() => setSendStates((current) => ({ ...current, [listing.id]: { status: 'confirming' } }))}
                    onCancel={() => setSendStates(({ [listing.id]: _dropped, ...rest }) => rest)}
                    onSend={(price) => void sendPrice(listing, price, single?.mallPrice ?? null)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        몰 가격은 몰에서 가져올 때 읽은 값입니다. 몰마다 가격의 뜻이 다를 수 있습니다(할인 전 가격을 주는 몰 등). 가격
        보내기는 판매상품 기준 가격을 그 몰에 보내고 몰을 다시 읽어 확인합니다 — 지금은 카카오 톡스토어만 됩니다.
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
  if (state?.status === 'sending') return <span className="text-slate-500">보내는 중…</span>;
  if (state?.status === 'done') {
    return <span className={state.confirmed ? 'text-emerald-700' : 'text-amber-700'}>{state.message}</span>;
  }
  if (state?.status === 'confirming') {
    return (
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
