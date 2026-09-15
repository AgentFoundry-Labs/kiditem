'use client';

import { Boxes, PackageCheck, ShoppingCart } from 'lucide-react';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import { cn, formatNumber } from '@/lib/utils';
import { mallAccentClass, mallLogoPath, mallMonogram } from '../../_shared/mall-presentation';
import {
  CAPABILITY_KEYS,
  type CapabilityKey,
  type MallCapabilities,
} from '../../_shared/mall-capabilities';
import { CapabilityPill } from './CapabilityPill';

/**
 * 연결된 몰 카드 한 장 — 세로로 세운 카드.
 *
 * 로고 · 이름 · 되는 일 넷(주문수집 · 송장전송 · 상품등록 · 품절관리) · 숫자 셋(상품 · 리스팅
 * · 주문). **모든 카드가 같은 틀이다** — 칸이 있다 없다 하면 카드 높이가 들쭉날쭉하고, 없는
 * 칸이 '0' 인지 '안 적음' 인지 구별이 안 된다.
 *
 * 숫자는 우리 DB 에서 센 것이다. 몰에 물어본 값이 아니다. 리스팅을 한 번도 가져오지
 * 않은 몰에 0 을 찍으면 "이 몰엔 아무것도 없다"로 읽히는데, 실제로는 "우리가 아직 안
 * 가져왔다"이다. 그래서 그 칸은 0 대신 `—` 로 둔다.
 */
export function ChannelCard({
  channel,
  capabilities,
  notes,
}: {
  channel: MallChannelSummary;
  capabilities: MallCapabilities;
  /** 줄마다 기본 설명 대신 붙는 사연(옥션 상품등록 · 완전품절=삭제 몰의 품절관리). */
  notes?: Partial<Record<CapabilityKey, string | null>>;
}) {
  const logo = mallLogoPath(channel.mallKey);
  return (
    <article className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-2.5 pb-3 pt-4 transition hover:border-slate-300">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- public 정적 파일
        <img
          src={logo}
          alt=""
          className="h-14 w-14 flex-none rounded-2xl border border-slate-200 bg-white object-contain p-1.5"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex h-14 w-14 flex-none items-center justify-center rounded-2xl text-base font-bold',
            mallAccentClass(channel.mallKey),
          )}
        >
          {mallMonogram(channel.mallName)}
        </span>
      )}
      <h3 className="mt-2 w-full truncate text-center text-xs font-semibold text-slate-900">
        {channel.mallName}
      </h3>

      {/* 이 몰로 무엇이 되는가. 줄이 늘 같은 순서·같은 자리에 선다. */}
      <ul className="mt-2.5 w-full space-y-1">
        {CAPABILITY_KEYS.map((key) => (
          <CapabilityPill key={key} kind={key} state={capabilities[key]} note={notes?.[key]} />
        ))}
      </ul>

      <dl className="mt-2.5 grid w-full grid-cols-3 gap-1 border-t border-slate-100 pt-2 text-center">
        <Stat icon={Boxes} label="상품" value={channel.imported ? channel.productCount : null} />
        <Stat icon={PackageCheck} label="리스팅" value={channel.imported ? channel.listingCount : null} />
        <Stat
          icon={ShoppingCart}
          label="주문"
          value={channel.imported || channel.orderCount > 0 ? channel.orderCount : null}
        />
      </dl>
    </article>
  );
}

/** 숫자 한 칸. 모르는 값(`null`)은 0 이 아니라 `—` 다. */
function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Boxes;
  label: string;
  value: number | null;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center justify-center gap-0.5 text-[10px] text-slate-400">
        <Icon size={9} />
        {label}
      </dt>
      {value === null ? (
        <dd title="아직 가져온 적이 없습니다" className="mt-0.5 text-xs font-semibold text-slate-300">
          —
        </dd>
      ) : (
        <dd className="mt-0.5 truncate text-xs font-semibold tabular-nums text-slate-900">
          {formatNumber(value)}
        </dd>
      )}
    </div>
  );
}
