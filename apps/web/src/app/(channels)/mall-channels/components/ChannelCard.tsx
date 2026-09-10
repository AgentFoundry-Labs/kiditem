'use client';

import { Boxes, PackageCheck, Send, ShoppingCart } from 'lucide-react';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import { cn, formatNumber } from '@/lib/utils';
import {
  MALL_READINESS_LABEL,
  MALL_READINESS_TONE,
  mallAccentClass,
  mallLogoPath,
  mallMonogram,
} from '../../_shared/mall-presentation';

/**
 * 몰 카드 한 장.
 *
 * 숫자는 우리 DB 에서 센 것이다. 몰에 물어본 값이 아니다. 리스팅을 한 번도
 * 가져오지 않은 몰에 0 을 세 개 찍으면 "이 몰엔 아무것도 없다"로 읽히는데,
 * 실제로는 "우리가 아직 안 가져왔다"이다. 그래서 그 경우 숫자를 감춘다.
 */
export function ChannelCard({ channel }: { channel: MallChannelSummary }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {mallLogoPath(channel.mallKey) ? (
            // eslint-disable-next-line @next/next/no-img-element -- public 정적 파일
            <img
              src={mallLogoPath(channel.mallKey) as string}
              alt=""
              className="h-9 w-9 flex-none rounded-lg border border-slate-200 bg-white object-contain p-1"
            />
          ) : (
            <span
              aria-hidden
              className={cn(
                'flex h-9 w-9 flex-none items-center justify-center rounded-lg text-xs font-bold',
                mallAccentClass(channel.mallKey),
              )}
            >
              {mallMonogram(channel.mallName)}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{channel.mallName}</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 flex-none rounded-full', MALL_READINESS_TONE[channel.readiness])} />
              <span className="text-[11px] text-slate-400">
                {MALL_READINESS_LABEL[channel.readiness]}
              </span>
            </div>
          </div>
        </div>
        {channel.canPublish ? (
          <span
            title="이 몰로 상품을 보낼 수 있습니다."
            className="inline-flex flex-none items-center gap-1 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary"
          >
            <Send size={9} />
            등록
          </span>
        ) : null}
      </div>

      {channel.imported ? (
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
          <Stat icon={Boxes} label="상품" value={channel.productCount} />
          <Stat icon={PackageCheck} label="리스팅" value={channel.listingCount} />
          <Stat icon={ShoppingCart} label="주문" value={channel.orderCount} />
        </dl>
      ) : channel.orderCount > 0 ? (
        // 리스팅은 안 가져왔지만 주문은 있는 몰. 그 사실만 짧게 남긴다.
        // 같은 안내 문장을 스물일곱 장에 반복하면 아무도 읽지 않는다.
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-[11px] text-slate-500">
            주문 {formatNumber(channel.orderCount)}건
          </p>
        </div>
      ) : null}
    </article>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[10px] text-slate-400">
        <Icon size={9} />
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
        {formatNumber(value)}
      </dd>
    </div>
  );
}
