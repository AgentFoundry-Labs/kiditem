'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Info, Loader2 } from 'lucide-react';
import { friendlyError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import {
  describeRegistrationOperation,
  listRegistrationOperations,
  registrationOperationKeys,
  type RegistrationOperationState,
} from '../_shared/registration-operation';
import { RegistrationOperationResolution } from '../_shared/RegistrationOperationResolution';
import { registrationTaskRow, registrationTasksPollMs } from './lib/registration-task-rows';

/** 한 번에 읽는 최근 등록 실행 수. */
const LIST_LIMIT = 100;

const STATE_TONE: Record<RegistrationOperationState, string> = {
  running: 'bg-blue-50 text-blue-700',
  needs_confirmation: 'bg-amber-50 text-amber-800',
  filled: 'bg-slate-100 text-slate-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

function startedLabel(value: string | Date): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * 송신 내역 — 등록 실행(`channels.registration`) 목록(KID-364).
 *
 * 등록 · 수정 · 품절 · 재개 · 가격 · 대표이미지가 모두 등록 실행 하나라 한 표에서 상태로 본다. 성공과 실패 둘로
 * 나누지 않는다 — 몰에 보냈지만 결과를 못 읽은 실행은 "확인 필요"로 남고, 이 화면에서 몰에서 읽은 값으로 닫는다.
 * 목록은 조회 하나(`GET /api/operations?kinds=channels.registration`)이고, 도는 실행이 있을 때만 10초마다 다시 읽는다.
 */
export default function MallTasksPage() {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const listQuery = useQuery({
    queryKey: registrationOperationKeys.list(LIST_LIMIT),
    queryFn: () => listRegistrationOperations(LIST_LIMIT),
    refetchInterval: (query) => registrationTasksPollMs(query.state.data?.operations ?? []),
    refetchIntervalInBackground: false,
  });
  const operations = useMemo(() => listQuery.data?.operations ?? [], [listQuery.data]);
  const rows = useMemo(() => operations.map(registrationTaskRow), [operations]);
  const needsConfirmation = rows.filter((row) => row.state === 'needs_confirmation').length;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: registrationOperationKeys.all });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-slate-600" />
          송신 내역
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          상품등록 · 수정 · 품절 · 재개 · 가격 · 대표이미지 송신을 등록 실행 하나씩 한 표에서 상태로 봅니다.
          {needsConfirmation > 0 ? ` 확인 필요 ${needsConfirmation}건.` : ''}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {listQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            송신 내역을 읽는 중
          </div>
        ) : listQuery.isError ? (
          <p role="alert" className="px-6 py-10 text-center text-sm text-red-600">
            {friendlyError(listQuery.error, '송신 내역을 읽지 못했습니다.')}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            아직 송신 기록이 없습니다. 상품 등록 화면이나 품절 관리에서 보내면 여기에 쌓입니다.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-32 px-3 py-2 text-left font-semibold">시작</th>
                <th className="w-32 px-3 py-2 text-left font-semibold">몰</th>
                <th className="w-24 px-3 py-2 text-left font-semibold">종류</th>
                <th className="w-40 px-3 py-2 text-left font-semibold">대상</th>
                <th className="w-24 px-3 py-2 text-left font-semibold">상태</th>
                <th className="px-3 py-2 text-left font-semibold">결과</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <Fragment key={row.id}>
                  <tr className="border-b border-slate-100 align-top">
                    <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{startedLabel(row.startedAt)}</td>
                    <td className="px-3 py-2 text-slate-800">{row.mallName}</td>
                    <td className="px-3 py-2 text-slate-600">{row.kindLabel}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.target}</td>
                    <td className="px-3 py-2">
                      {row.state === 'needs_confirmation' ? (
                        <button
                          type="button"
                          onClick={() => setOpenId(openId === row.id ? null : row.id)}
                          className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline', STATE_TONE[row.state])}
                        >
                          {row.stateLabel}
                        </button>
                      ) : (
                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', STATE_TONE[row.state])}>{row.stateLabel}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.summary}</td>
                  </tr>
                  {openId === row.id && operations[index] ? (
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td colSpan={6} className="px-3 py-2.5">
                        <RegistrationOperationResolution
                          read={describeRegistrationOperation(operations[index]!)}
                          onResolved={() => {
                            setOpenId(null);
                            refresh();
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info size={15} className="mt-0.5 flex-none" />
        <div>
          <strong>전송 완료는 성공이 아닙니다.</strong> 몰이 확인한 것만 <strong>확인 완료</strong>입니다. 몰에 보냈지만 결과를
          읽지 못한 실행은 <strong>확인 필요</strong>로 남습니다 — 몰에서 확인한 값으로 닫아 주세요.
        </div>
      </div>
    </div>
  );
}
