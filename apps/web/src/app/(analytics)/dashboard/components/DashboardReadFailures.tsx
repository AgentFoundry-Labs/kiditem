import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * 읽지 못한 것 — 이름과 다시 시도, 그것뿐.
 *
 * 오른쪽 '현재 상태' 칸이 알림과 함께 들고 있던 것을 떼어 헤더 아래 한 줄로 세운다. 그 칸은
 * 에이전트 칸(긴급)과 겹쳐 걷었지만, 읽기 실패는 겹치는 것이 아니다 — 여기서 숨기면 값이 빈
 * 카드가 '0'인지 '못 읽음'인지 알 길이 없다. 전송 계층의 원문('502 Bad Gateway', '개발팀에
 * 문의하세요')은 보는 사람이 할 수 있는 일이 없어 싣지 않는다.
 */
export type DashboardReadFailure = {
  key: string;
  label: string;
  retry: () => void;
};

export function DashboardReadFailures({ failures }: { failures: readonly DashboardReadFailure[] }) {
  if (failures.length === 0) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-[13px]"
    >
      <span className="flex items-center gap-1.5 font-semibold text-red-700">
        <AlertTriangle size={14} aria-hidden />
        읽기 실패
      </span>
      {failures.map((failure) => (
        <span
          key={failure.key}
          className="inline-flex items-center gap-1 text-red-800"
          data-testid="dashboard-read-failure"
          data-read-failure={failure.label}
        >
          {failure.label}
          <button
            type="button"
            aria-label={`${failure.label} 다시 시도`}
            title="다시 시도"
            onClick={failure.retry}
            className="rounded p-0.5 text-red-400 transition hover:bg-red-100 hover:text-red-700"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
