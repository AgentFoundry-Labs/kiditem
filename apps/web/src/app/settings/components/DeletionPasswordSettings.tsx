'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';

/**
 * 삭제 전용 비밀번호 설정.
 *
 * 쿠팡 상품 삭제처럼 되돌릴 수 없는 동작 앞의 게이트다. 계정 비밀번호와 별개이며,
 * 서버는 scrypt 해시로만 저장한다. 이 화면은 평문을 저장하지도, 해시를 받지도 않는다 —
 * 서버가 돌려주는 것은 `configured` 뿐이다.
 */
export default function DeletionPasswordSettings() {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { data: status, isLoading } = useQuery({
    queryKey: queryKeys.deletionPassword.status(),
    queryFn: () =>
      apiClient.get<{ configured: boolean; updatedAt: string | null }>(
        '/api/organizations/deletion-password',
      ),
  });

  const configured = status?.configured ?? false;

  const save = useMutation({
    mutationFn: () =>
      apiClient.put<{ configured: boolean; updatedAt: string }>(
        '/api/organizations/deletion-password',
        configured ? { currentPassword, newPassword } : { newPassword },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deletionPassword.all });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(configured ? '삭제 비밀번호를 변경했습니다.' : '삭제 비밀번호를 등록했습니다.');
    },
    onError: (err) => {
      toast.error(
        isApiError(err) ? err.detail : '삭제 비밀번호 저장에 실패했습니다.',
      );
    },
  });

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSave =
    newPassword.length >= 8
    && newPassword === confirmPassword
    && (!configured || currentPassword.length > 0)
    && !save.isPending;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
          <ShieldAlert size={18} />
        </div>
        <div>
          <h2 className="text-sm font-black text-slate-900">삭제 비밀번호</h2>
          <p className="mt-0.5 text-[12px] font-semibold text-slate-500">
            쿠팡 등록상품 삭제처럼 되돌릴 수 없는 작업에만 쓰입니다. 계정 비밀번호와 다른 값을
            쓰세요.
          </p>
        </div>
      </header>

      {isLoading ? (
        <p className="text-[12px] font-semibold text-slate-400">불러오는 중…</p>
      ) : (
        <div className="space-y-3">
          <p
            className={
              configured
                ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-800'
                : 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800'
            }
          >
            {configured
              ? '삭제 비밀번호가 설정되어 있습니다.'
              : '아직 설정되지 않았습니다. 등록하기 전까지 삭제 기능을 쓸 수 없습니다.'}
          </p>

          {configured && (
            <label className="block">
              <span className="mb-1 block text-[12px] font-black text-slate-700">
                현재 삭제 비밀번호
              </span>
              <input
                type="password"
                autoComplete="off"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rose-400"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[12px] font-black text-slate-700">
              새 삭제 비밀번호
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rose-400"
            />
            <span className="mt-1 block text-[11px] font-semibold text-slate-400">
              8자 이상
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-black text-slate-700">
              새 삭제 비밀번호 확인
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rose-400"
            />
            {mismatch && (
              <span className="mt-1 block text-[11px] font-bold text-rose-600">
                두 값이 다릅니다.
              </span>
            )}
          </label>

          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!canSave}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
            {configured ? '변경' : '등록'}
          </button>
        </div>
      )}
    </section>
  );
}
