import type { WingCatalogSource } from '../hooks/use-wing-catalog-source';

/**
 * How the latest Wing catalog collection ended. Start, running state and stop
 * belong to the screen's shared collection control.
 */
export function WingCatalogSourceStatus({ source }: { source: WingCatalogSource }) {
  const { attempt } = source;
  if (!attempt || attempt.state === 'RUNNING') return null;
  const cancelled = attempt.state === 'FAILED' && attempt.errorCode === 'USER_CANCELLED';
  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border p-3 text-sm">
      <span>
        {attempt.state === 'COMPLETE'
          ? 'Wing 카탈로그 수집 완료'
          : cancelled
            ? 'Wing 카탈로그 수집 중단됨'
            : 'Wing 카탈로그 수집 실패'}
      </span>
      {attempt.state === 'FAILED' && !cancelled && attempt.errorMessage && (
        <span className="text-destructive">{attempt.errorMessage}</span>
      )}
    </div>
  );
}
