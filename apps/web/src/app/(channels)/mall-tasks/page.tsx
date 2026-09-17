'use client';

import { CircleDashed, ClipboardList, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskStatusSpec {
  status: string;
  label: string;
  tone: 'neutral' | 'blocked' | 'running' | 'good' | 'bad' | 'unknown';
  meaning: string;
}

/**
 * 송신 상태 어휘.
 *
 * 성공/실패 둘로 나누지 않는 것이 이 설계의 핵심이다. 사방넷은 "실제 등록 성공
 * 여부와 상관없이 처리완료로 변경"했고, 팝업이 닫히면 "실패로 확인되지 않으며"
 * 아무 데도 남지 않았다. 그래서 확인되지 않은 상태를 1급으로 만든다.
 */
const TASK_STATUSES: TaskStatusSpec[] = [
  {
    status: 'blocked',
    label: '검증에서 막힘',
    tone: 'blocked',
    meaning: '고시·KC·카테고리·프로필이 미충족이라 몰에 요청을 보내지 않았습니다.',
  },
  {
    status: 'submitted',
    label: '전송함',
    tone: 'running',
    meaning: '몰에 요청은 갔습니다. 아직 성공이 아닙니다.',
  },
  {
    status: 'verifying',
    label: '확인 중',
    tone: 'running',
    meaning: '몰을 다시 조회해 실제로 반영됐는지 보는 중입니다.',
  },
  {
    status: 'published',
    label: '완료',
    tone: 'good',
    meaning: '몰 재조회로 확인됐습니다. 이 상태만 성공으로 셉니다.',
  },
  {
    status: 'failed',
    label: '실패',
    tone: 'bad',
    meaning: '몰이 거절했고 사유가 정규화 코드로 남습니다.',
  },
  {
    status: 'unknown_needs_reconcile',
    label: '확인 안 됨',
    tone: 'unknown',
    meaning:
      '응답이 끊겼거나 실행이 중단됐습니다. 성공도 실패도 아니라 그대로 남기고 자동으로 재조회합니다.',
  },
  {
    status: 'skipped_duplicate',
    label: '중복이라 건너뜀',
    tone: 'neutral',
    meaning: '몰에 이미 있는 상품이라 다시 만들지 않았습니다.',
  },
  {
    status: 'rolled_back',
    label: '되돌림',
    tone: 'neutral',
    meaning: '보내기 전 상태로 복구했습니다.',
  },
];

const TONE_CLASS: Record<TaskStatusSpec['tone'], string> = {
  neutral: 'bg-slate-100 text-slate-600',
  blocked: 'bg-slate-200 text-slate-700',
  running: 'bg-blue-50 text-blue-700',
  good: 'bg-emerald-50 text-emerald-700',
  bad: 'bg-red-50 text-red-700',
  unknown: 'bg-amber-50 text-amber-700',
};

/**
 * 송신 내역.
 *
 * 등록과 품절을 한 표에서 상태 필터로 본다. 사방넷은 성공 화면과 실패 큐가
 * 갈려 있어 "어디에도 안 잡힌 건"이 존재할 수 있었다.
 */
export default function MallTasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-slate-600" />
          송신 내역
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          상품등록과 품절 송신의 실행 기록을 한 표에서 상태로 봅니다.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
        <CircleDashed size={28} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">아직 송신 기록이 없습니다.</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          몰별 어댑터가 붙으면 여기에 쌓입니다. 먼저{' '}
          <strong>상품 등록</strong> 화면에서 검증을 통과시키고, <strong>품절 관리</strong> 에서
          보낼 대상을 확인하세요.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">여기에 쓸 상태</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <tbody>
              {TASK_STATUSES.map((spec) => (
                <tr key={spec.status} className="border-b border-slate-50 last:border-b-0">
                  <td className="w-48 px-4 py-3 align-top">
                    <span
                      className={cn(
                        'inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium',
                        TONE_CLASS[spec.tone],
                      )}
                    >
                      {spec.label}
                    </span>
                    <div className="mt-1 font-mono text-[10px] text-slate-400">{spec.status}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{spec.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info size={15} className="mt-0.5 flex-none" />
        <div>
          <strong>전송 완료는 성공이 아닙니다.</strong> 몰을 다시 조회해 확인된 것만
          <strong> 완료</strong>로 셉니다. 응답이 끊긴 건은 성공으로도 실패로도 넘기지 않고{' '}
          <strong>확인 안 됨</strong>으로 남겨 자동 재조회 대상이 됩니다.
        </div>
      </div>
    </div>
  );
}
