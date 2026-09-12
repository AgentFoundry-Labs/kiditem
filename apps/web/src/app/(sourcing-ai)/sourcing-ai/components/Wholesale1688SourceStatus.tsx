import { friendlyError } from '@/lib/api-error';
import type { Sourcing1688SearchSnapshot } from '@kiditem/shared/sourcing';
import type { Wholesale1688Attempt } from '../lib/wholesale-1688-results-api';

export function Wholesale1688SourceStatus({ sources, attempts, error }: {
  sources: Sourcing1688SearchSnapshot['sourceStatuses'];
  attempts: Wholesale1688Attempt[];
  error: unknown;
}) {
  return (
    <div className="mt-5 space-y-2 text-xs text-[#667085]" aria-live="polite">
      {error != null && <p role="alert">요청 확인 실패: {friendlyError(error)}. 저장된 source 상태를 확인해 주세요.</p>}
      {attempts.map((attempt) => <p key={attempt.attemptId}>
        요청 결과 · {attempt.plan.keyword} · {attempt.state === 'FAILED'
          ? `수집 실패 (${attempt.errorCode ?? 'unknown'})`
          : attempt.state === 'RUNNING' ? '수집 중' : '수집 완료'}
      </p>)}
      {sources.map((source) => (
        <div key={source.targetId ?? source.keyword}>
          <p>
            {source.targetId ?? source.keyword} · {source.latestAttemptState === 'FAILED'
              ? `수집 실패 (${source.errorCode ?? 'unknown'})`
              : source.refreshing ? '수집 중'
                : source.ready ? '수집 완료'
                  : source.actualCutoffAt ? '다시 수집 필요' : '수집 기록 없음'}
          </p>
          {source.actualCutoffAt && <p>마지막 완료: <time dateTime={source.actualCutoffAt}>{source.actualCutoffAt}</time></p>}
        </div>
      ))}
    </div>
  );
}
