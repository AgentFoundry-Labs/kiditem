'use client';

import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import {
  linkImportedListings,
  SABANGNET_NO_MALL_ACCOUNTS,
  sabangnetListingsCollection,
} from './sabangnet-listings-collection';
import { attemptFailureText } from '@/lib/operator-error';

export const SABANGNET_IMPORT_TITLE =
  '사방넷 송신 기록에서 몰마다 등록된 상품(몰 상품코드)을 한 번에 가져옵니다. 사방넷에는 아무것도 보내지 않습니다.';

/**
 * 사방넷에서 몰 등록 상품을 가져오는 자리(KID-246) — 시작 · 중단과 마지막으로 가져온 결과.
 *
 * 상품마다 확인하지 않는다. 사방넷 송신 기록 전체를 한 번에 읽어 몰 계정마다 리스팅으로
 * 바꾸고, 끝나면 셀피아 SKU 에 잇는다. 사방넷을 쓰는 동안은 이 버튼으로 다시 맞춘다.
 *
 * 잇기는 완료를 본 화면이 한 번 돌린다. 가져오는 동안 화면을 닫았거나 뒤에 두었으면 그 순간을
 * 못 보므로 '셀피아 상품에 연결'로 언제든 다시 돌린다.
 */
export function SabangnetListingsImport({ className }: { className?: string }) {
  const adapter = useMemo(() => sabangnetListingsCollection(), []);
  const control = useCollectionSourceControl(adapter);
  const queryClient = useQueryClient();
  const link = useMutation({
    mutationFn: () => linkImportedListings(queryClient),
    onSuccess: (result) => {
      if (result.failedAccounts > 0) {
        toast.warning(`몰 ${result.failedAccounts}곳은 연결하지 못했습니다. 다시 눌러 주세요.`);
        return;
      }
      toast.success(`셀피아 상품에 새로 이은 리스팅 ${formatNumber(result.matchedListings)}개 · 몰 ${formatNumber(result.accounts)}곳`);
    },
    onError: () => toast.error('셀피아 상품에 잇지 못했습니다. 잠시 뒤 다시 눌러 주세요.'),
  });
  const status = control.status;
  const publication = status?.latestPublication ?? [];
  const listings = publication.reduce((sum, mall) => sum + mall.listings, 0);
  const malls = publication.filter((mall) => mall.listings > 0).length;
  const completedAt = status?.latestSucceeded?.finishedAt ?? null;
  const latest = status?.latestOperation ?? null;
  // 멈춘 것은 실패가 아니다. 이전에 가져온 결과가 그대로 쓰인다.
  const stopped = latest?.status === 'cancelled';
  const failure = latest?.status === 'failed' ? latest : null;

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
      {completedAt ? (
        <span
          className="text-xs text-slate-500"
          title={publication
            .map((mall) => `${mall.mallKey} ${formatNumber(mall.listings)}개${mall.deactivated ? ` · 내려감 ${formatNumber(mall.deactivated)}` : ''}`)
            .join('\n')}
        >
          사방넷 기준 {formatNumber(listings)}개 · 몰 {formatNumber(malls)}곳 · {timeAgo(completedAt)}
        </span>
      ) : status ? (
        <span className="text-xs text-slate-400">사방넷에서 아직 가져오지 않았습니다</span>
      ) : null}
      {stopped ? (
        <span role="status" className="text-xs text-slate-500">{COLLECTION_STOPPED_MESSAGE}</span>
      ) : failure ? (
        <span role="status" className="max-w-xs text-xs text-red-600">
          {attemptFailureText(failure, 'sabangnet_mall_listings')}
        </span>
      ) : null}
      {malls > 0 && control.state !== 'running' ? (
        <button
          type="button"
          onClick={() => link.mutate()}
          disabled={link.isPending}
          title="가져온 리스팅을 사방넷 모델명(셀피아 상품코드)으로 셀피아 상품에 잇습니다. 이미 이어진 리스팅은 건드리지 않습니다."
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
        startLabel="사방넷에서 가져오기"
        startTitle={SABANGNET_IMPORT_TITLE}
        onStart={() => control.start()}
        onStop={control.stop}
        startBlockedReason={status && !status.ready ? SABANGNET_NO_MALL_ACCOUNTS : null}
      />
    </div>
  );
}
