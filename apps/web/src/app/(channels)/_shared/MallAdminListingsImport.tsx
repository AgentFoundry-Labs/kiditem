'use client';

import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { MallAdminListingMallKey } from '@kiditem/shared/mall-admin-listings';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { COLLECTION_STOPPED_MESSAGE, stoppedAttempt } from '@/lib/collection-source-status-query';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import {
  linkMallAdminListings,
  mallAdminListingsCollection,
  mallFrom,
  MALL_ADMIN_NO_ACCOUNT,
} from './mall-admin-listings-collection';

/**
 * 몰 관리자에서 등록 상품을 직접 가져오는 자리(KID-246 2단계) — 키드키즈 · 아이스크림몰처럼
 * 사방넷에 없는 몰. 몰마다 컨트롤 하나가 서고, 사방넷 가져오기와 같은 모양이다.
 *
 * 상품마다 확인하지 않는다. 그 몰 상품 목록 전체를 한 번에 읽어 리스팅으로 바꾸고, 끝나면
 * 셀피아 SKU 에 잇는다. 완료를 본 화면이 한 번 잇고, 그 순간을 못 봤으면 '셀피아 상품에 연결'로
 * 다시 돌린다.
 *
 * `layout="row"` 는 쇼핑몰 현황 표의 그 몰 줄에 서는 작은 모양이다(사장님 2026-09-19 "버튼을 몰 옆에다가
 * 정리해놔") — 같은 시작 · 연결이고 글자만 줄인다. 버튼 이름은 둘 다 같다.
 */
export function MallAdminListingsImport({
  mallKey,
  layout = 'bar',
  className,
}: {
  mallKey: MallAdminListingMallKey;
  layout?: 'bar' | 'row';
  className?: string;
}) {
  const adapter = useMemo(() => mallAdminListingsCollection(mallKey), [mallKey]);
  const control = useCollectionSourceControl(adapter);
  const queryClient = useQueryClient();
  const link = useMutation({
    mutationFn: () => linkMallAdminListings(queryClient, mallKey),
    onSuccess: (result) => {
      if (result.failed) {
        toast.warning('셀피아 상품에 잇지 못했습니다. 다시 눌러 주세요.');
        return;
      }
      toast.success(`셀피아 상품에 새로 이은 리스팅 ${formatNumber(result.matchedListings)}개`);
    },
    onError: () => toast.error('셀피아 상품에 잇지 못했습니다. 잠시 뒤 다시 눌러 주세요.'),
  });

  const mall = mallFrom(control.status, mallKey);
  const mallName = mall?.mallName ?? '몰';
  const publication = mall?.latestPublication ?? null;
  const listings = publication?.listings ?? 0;
  const completedAt = mall?.latestComplete?.completedAt ?? null;
  const latest = mall?.latestAttempt ?? null;
  // 멈춘 것은 실패가 아니다. 이전에 가져온 결과가 그대로 쓰인다.
  const stopped = stoppedAttempt(latest);
  const failure = latest?.state === 'FAILED' && !stopped ? latest : null;
  const hasAccount = mall ? mall.channelAccountId !== null : true;
  const statusTitle = publication
    ? Object.entries(publication.statuses)
        .map(([status, count]) => `${status} ${formatNumber(count)}`)
        .join(' · ')
    : undefined;
  const canLink = listings > 0 && control.state !== 'running';

  if (layout === 'row') {
    return (
      <div className={cn('flex items-start gap-1.5', className)}>
        <CollectionStartControl
          control={control}
          startLabel="가져오기"
          startAriaLabel={`${mallName}에서 가져오기`}
          startTitle={`${mallName} 관리자 화면에서 등록된 상품(몰 상품코드)을 한 번에 가져옵니다. 몰에는 조회만 합니다.`}
          onStart={() => control.start()}
          onStop={control.stop}
          startBlockedReason={!hasAccount ? MALL_ADMIN_NO_ACCOUNT : null}
          size="sm"
          className="items-start"
        />
        {canLink ? (
          <button
            type="button"
            onClick={() => link.mutate()}
            disabled={link.isPending}
            aria-label="셀피아 상품에 연결"
            title="가져온 리스팅을 몰에 적어 둔 셀피아 상품 이름으로 셀피아 상품에 잇습니다. 이미 이어진 리스팅은 건드리지 않습니다."
            className="inline-flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {link.isPending
              ? <Loader2 size={13} className="animate-spin" aria-hidden />
              : <Link2 size={13} aria-hidden />}
          </button>
        ) : null}
        {/* 한 줄만 — 실패 · 중단이면 그 말을(전문은 풀이로), 아니면 마지막으로 가져온 수와 때. 줄 아래로 글을 내리지 않는다. */}
        <span className="flex min-h-[26px] items-center whitespace-nowrap text-[11px]">
          {stopped ? (
            <span role="status" className="text-slate-500" title={COLLECTION_STOPPED_MESSAGE}>중단함</span>
          ) : failure?.errorMessage ? (
            <span role="status" className="max-w-[9rem] truncate text-red-600" title={failure.errorMessage}>
              {failure.errorMessage}
            </span>
          ) : completedAt ? (
            <span className="text-slate-500" title={statusTitle}>
              {formatNumber(listings)}개 · {timeAgo(completedAt)}
            </span>
          ) : control.status ? (
            <span className="text-slate-400">아직 안 가져옴</span>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
      {completedAt ? (
        <span className="text-xs text-slate-500" title={statusTitle}>
          {mallName} {formatNumber(listings)}개 · {timeAgo(completedAt)}
        </span>
      ) : control.status ? (
        <span className="text-xs text-slate-400">{mallName}에서 아직 가져오지 않았습니다</span>
      ) : null}
      {stopped ? (
        <span role="status" className="text-xs text-slate-500">{COLLECTION_STOPPED_MESSAGE}</span>
      ) : failure?.errorMessage ? (
        <span role="status" className="max-w-xs text-xs text-red-600">
          {failure.errorMessage}
        </span>
      ) : null}
      {canLink ? (
        <button
          type="button"
          onClick={() => link.mutate()}
          disabled={link.isPending}
          title="가져온 리스팅을 몰에 적어 둔 셀피아 상품 이름으로 셀피아 상품에 잇습니다. 이미 이어진 리스팅은 건드리지 않습니다."
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {link.isPending
            ? <Loader2 size={14} className="animate-spin" aria-hidden />
            : <Link2 size={14} aria-hidden />}
          {link.isPending ? '연결 중…' : '셀피아 상품에 연결'}
        </button>
      ) : null}
      <CollectionStartControl
        control={control}
        startLabel={`${mallName}에서 가져오기`}
        startTitle={`${mallName} 관리자 화면에서 등록된 상품(몰 상품코드)을 한 번에 가져옵니다. 몰에는 조회만 합니다.`}
        onStart={() => control.start()}
        onStop={control.stop}
        startBlockedReason={!hasAccount ? MALL_ADMIN_NO_ACCOUNT : null}
      />
    </div>
  );
}
