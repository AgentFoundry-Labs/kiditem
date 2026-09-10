'use client';

import { FileSpreadsheet, Plug, Puzzle, Store } from 'lucide-react';
import type { MallChannelOverview } from '@kiditem/shared/mall-publishing';
import { formatNumber } from '@/lib/utils';

/**
 * 허브 중앙 띠.
 *
 * 왼쪽이 우리 상품이 들어오는 곳, 가운데가 우리, 오른쪽부터 아래로 몰이다.
 * 점선은 장식이 아니라 방향을 말한다 — 상품은 한 곳에서 나와 여러 몰로 간다.
 *
 * 원형 배치를 쓰지 않았다. 연결된 몰이 25곳이라 원으로 두르면 아무것도 읽히지
 * 않는다. 참고 디자인은 12곳 기준이다.
 */
export function ChannelHubBand({ shop }: { shop: MallChannelOverview['shop'] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-center">
        <div className="flex-1 rounded-lg border border-dashed border-slate-300 p-4">
          <div className="text-xs font-semibold text-slate-500">상품이 들어오는 곳</div>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <Store size={13} className="text-slate-400" />
              셀피아 재고
            </li>
            <li className="flex items-center gap-2">
              <Puzzle size={13} className="text-slate-400" />
              확장 수집
            </li>
            <li className="flex items-center gap-2">
              <FileSpreadsheet size={13} className="text-slate-400" />
              몰 리스팅 가져오기
            </li>
          </ul>
        </div>

        <DottedRail />

        <div className="flex-1 rounded-lg bg-primary px-5 py-4 text-white">
          <div className="text-sm font-semibold">KidItem</div>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[11px] text-white/70">상품</dt>
              <dd className="text-xl font-bold tabular-nums">{formatNumber(shop.productCount)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-white/70">연결된 몰</dt>
              <dd className="text-xl font-bold tabular-nums">
                {formatNumber(shop.connectedChannelCount)}
              </dd>
            </div>
          </dl>
        </div>

        <DottedRail />

        <div className="flex-1 rounded-lg border border-dashed border-slate-300 p-4">
          <div className="text-xs font-semibold text-slate-500">상품을 보낼 수 있는 몰</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {formatNumber(shop.publishableChannelCount)}
            </span>
            <span className="text-sm text-slate-400">
              / {formatNumber(shop.connectedChannelCount)}
            </span>
          </div>
          <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
            <Plug size={11} className="mt-0.5 flex-none" />
            나머지는 주문수집만 연결돼 있습니다. 등록 경로는 몰마다 따로 붙습니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function DottedRail() {
  return (
    <div aria-hidden className="flex flex-none items-center justify-center lg:w-10">
      <span className="h-6 w-px border-l-2 border-dotted border-slate-300 lg:h-px lg:w-full lg:border-l-0 lg:border-t-2" />
    </div>
  );
}
