'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Link2, Package, PackageCheck, PackageX, Plug, type LucideIcon } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import {
  listSellpiaInventorySkus,
  sellpiaInventoryKeyParams,
} from '../../../(inventory)/_shared/inventory-api';

/** 요약만 읽는다 — 줄은 한 개면 된다. 셀피아에 지금 있는(활성) 상품이 기준이다. */
const SUMMARY_PARAMS = { page: 1, limit: 1 } as const;

type Tone = 'default' | 'good' | 'warn';

const VALUE_TONE: Record<Tone, string> = {
  default: 'text-slate-900',
  good: 'text-emerald-700',
  warn: 'text-orange-700',
};

interface Figure {
  label: string;
  value: number | null;
  unit: string;
  caption: string;
  icon: LucideIcon;
  tone: Tone;
  href?: string;
}

/**
 * 쇼핑몰 현황 맨 위 — 셀피아 기준 대시보드(사장님 2026-09-19 "셀피아 기준 대시보드를 상단에 해놔").
 *
 * 숫자는 재고 owner 의 셀피아 스냅샷 요약을 읽기만 한다: 셀피아에 지금 있는 상품, 그 가운데 재고 있음 · 품절(재고 0),
 * 몰 리스팅에 이어진 상품. 카드를 누르면 그 조건으로 거른 재고 화면이 열린다. 상품 마스터 수는 적지 않는다 —
 * 셀피아와 같은 코드로 만들어진 중복 마스터가 섞여 있어 '활성 상품'이 셀피아보다 크게 나온다(라이브 2026-09-19:
 * 마스터 2,918 · 셀피아 1,828).
 */
export function SellpiaDashboard({ connectedCount }: { connectedCount: number | null }) {
  const snapshotQuery = useQuery({
    queryKey: queryKeys.inventory.snapshot(sellpiaInventoryKeyParams(SUMMARY_PARAMS)),
    queryFn: () => listSellpiaInventorySkus(SUMMARY_PARAMS),
  });
  const data = snapshotQuery.data;
  const collected = Boolean(data?.latestImport);
  const summary = collected ? data?.summary ?? null : null;
  const syncedAt = data?.latestImport?.lastVerifiedAt ?? data?.latestImport?.importedAt ?? null;

  const totalCaption = snapshotQuery.isError
    ? isApiError(snapshotQuery.error) ? snapshotQuery.error.detail : '셀피아 재고를 불러오지 못했습니다.'
    : snapshotQuery.isLoading
      ? '불러오는 중'
      : !collected
        ? '셀피아 재고를 아직 가져오지 않았습니다.'
        : syncedAt
          ? `셀피아 동기화 ${timeAgo(syncedAt)}`
          : '셀피아에 지금 있는 상품';

  const figures: Figure[] = [
    {
      label: '셀피아 상품',
      value: summary?.totalSkus ?? null,
      unit: '개',
      caption: totalCaption,
      icon: Package,
      tone: 'default',
      href: '/inventory-hub',
    },
    {
      label: '재고 있음',
      value: summary?.inStockSkus ?? null,
      unit: '개',
      caption: '셀피아 재고 1개 이상',
      icon: PackageCheck,
      tone: 'good',
      href: '/inventory-hub?stockStatus=in_stock',
    },
    {
      label: '품절',
      value: summary?.outOfStockSkus ?? null,
      unit: '개',
      caption: '셀피아 재고 0',
      icon: PackageX,
      tone: 'warn',
      href: '/inventory-hub?stockStatus=out_of_stock',
    },
    {
      label: '몰에 연결',
      value: summary?.linkedSkus ?? null,
      unit: '개',
      caption: summary ? `미연결 ${formatNumber(summary.unlinkedSkus)}개` : '몰 리스팅에 이어진 상품',
      icon: Link2,
      tone: 'default',
      href: '/inventory-hub?linkStatus=unlinked',
    },
    {
      label: '연결된 몰',
      value: connectedCount,
      unit: '곳',
      caption: '계정이 연결된 몰',
      icon: Plug,
      tone: 'default',
    },
  ];

  return (
    <section aria-label="셀피아 기준 요약" className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {figures.map((figure) => <FigureCard key={figure.label} figure={figure} />)}
    </section>
  );
}

function FigureCard({ figure }: { figure: Figure }) {
  const { label, value, unit, caption, icon: Icon, tone, href } = figure;
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        <Icon size={14} aria-hidden />
        {label}
      </div>
      <div className={cn('mt-1 text-xl font-bold tabular-nums', value === null ? 'text-slate-300' : VALUE_TONE[tone])}>
        {value === null ? '—' : `${formatNumber(value)}${unit}`}
      </div>
      <p className="mt-2 truncate text-xs text-slate-400" title={caption}>{caption}</p>
    </>
  );
  return href ? (
    <Link href={href} className="card block transition hover:border-slate-300">
      {body}
    </Link>
  ) : (
    <div className="card">{body}</div>
  );
}
