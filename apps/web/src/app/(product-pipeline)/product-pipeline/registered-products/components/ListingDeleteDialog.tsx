'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import type { RegisteredChannelListing } from '../lib/channel-listings-api';

const DELETE_TIMEOUT_MS = 180_000;

/**
 * 등록상품 삭제 다이얼로그. ⚠️ 되돌릴 수 없다.
 *
 * 순서가 계약이다:
 *   1) 서버 인가 — 삭제 비밀번호 + "우리가 등록한 상품인가" 를 서버가 검증하고,
 *      마켓에서 지울 `externalId` 를 돌려준다. 이 단계는 아무것도 바꾸지 않는다.
 *   2) 확장이 WING 에서 실제 삭제.
 *   3) 서버가 우리 리스팅을 비활성화(다시 검증한다).
 *
 * 마켓을 먼저 지운다. 우리 DB 를 먼저 지우면 2단계가 실패했을 때
 * "쿠팡에는 살아 있는데 우리는 지운 줄 아는" 상태가 된다.
 */
export default function ListingDeleteDialog({
  listing,
  onClose,
}: {
  listing: RegisteredChannelListing | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);

  useEffect(() => {
    setPassword('');
    setBusy(false);
    setPhase(null);
  }, [listing]);

  const { data: passwordStatus } = useQuery({
    queryKey: queryKeys.deletionPassword.status(),
    queryFn: () =>
      apiClient.get<{ configured: boolean; updatedAt: string | null }>(
        '/api/organizations/deletion-password',
      ),
    enabled: listing !== null,
  });

  if (!listing) return null;

  const configured = passwordStatus?.configured ?? false;
  // 우리가 등록한 상품만 삭제 대상이다. 서버도 같은 규칙으로 다시 막지만,
  // 지울 수 없는 것을 지울 수 있는 것처럼 보여주지 않는다.
  const isOurs = Boolean(listing.sourceCandidateId);
  const canDelete = configured && isOurs && password.length > 0 && !busy;

  const errorMessage = (err: unknown, fallback: string): string =>
    isApiError(err) ? err.detail : err instanceof Error ? err.message : fallback;

  const handleDelete = async () => {
    if (!canDelete) return;
    setBusy(true);
    try {
      // 1) 서버 인가. 지울 대상은 서버가 정한다.
      setPhase('삭제 권한을 확인하는 중…');
      const authorized = await apiClient.post<{
        listingId: string;
        externalId: string;
        displayName: string;
        channel: string;
      }>(`/api/channels/listings/${listing.id}/deletion-authorization`, { password });

      // 2) 확장이 WING 에서 실제 삭제.
      setPhase('쿠팡 WING 에서 삭제하는 중…');
      const extensionId = await detectExtensionId();
      if (!extensionId) {
        throw new Error('KidItem 확장을 찾지 못했습니다. 확장을 설치/리로드한 뒤 다시 시도하세요.');
      }
      const result = await sendToExtension<{ ok?: boolean; error?: string }>(
        extensionId,
        {
          action: 'deleteWingProduct',
          externalId: authorized.externalId,
          displayName: authorized.displayName,
        },
        DELETE_TIMEOUT_MS,
      );
      if (!result?.ok) {
        throw new Error(result?.error || '쿠팡 WING 삭제에 실패했습니다.');
      }

      // 3) 마켓 삭제가 확인된 뒤에만 우리 리스팅을 비활성화한다.
      setPhase('등록상품 목록에서 정리하는 중…');
      await apiClient.post(`/api/channels/listings/${listing.id}/deletion`, { password });
      await queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all });
      toast.success('상품을 삭제했습니다', {
        description: `${authorized.displayName} (등록상품ID ${authorized.externalId})`,
      });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, '상품 삭제에 실패했습니다.'));
    } finally {
      setBusy(false);
      setPhase(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="등록상품 삭제"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-black text-rose-700">
            <AlertTriangle size={16} />
            등록상품 삭제
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* 무엇을 지우는지 명시한다. 이름과 등록상품ID 를 둘 다 보여준다. */}
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3">
            <p className="text-[12px] font-black text-rose-900">{listing.listingName}</p>
            <p className="mt-1 text-[11px] font-semibold text-rose-700">
              등록상품ID {listing.externalId}
            </p>
            <p className="mt-2 text-[11px] font-semibold text-rose-600">
              쿠팡에서 실제로 삭제되며 되돌릴 수 없습니다.
            </p>
          </div>

          {!isOurs && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-bold text-slate-600">
              이 상품은 카탈로그 수집으로 들어온 상품입니다. 우리가 등록한 상품만 삭제할 수
              있습니다.
            </p>
          )}

          {isOurs && !configured && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
              설정에서 삭제 비밀번호를 먼저 등록하세요.
            </p>
          )}

          {isOurs && configured && (
            <label className="block">
              <span className="mb-1 block text-[12px] font-black text-slate-700">
                삭제 비밀번호
              </span>
              <input
                type="password"
                value={password}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rose-400"
              />
            </label>
          )}

          {phase && (
            <p className="text-[11px] font-bold text-slate-500" aria-live="polite">
              {phase}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
