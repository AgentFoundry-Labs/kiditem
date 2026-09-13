import type { useWingCatalogSource } from '../hooks/use-wing-catalog-source';

export function WingCatalogSourceStatus({ source }: { source: ReturnType<typeof useWingCatalogSource> }) {
  if (!source.attempt && !source.isRunning && !source.error) return null;
  return <div role="status" className="flex items-center gap-3 rounded-lg border p-3 text-sm">
    <span>{source.isRunning ? 'Wing 카탈로그 수집 중' : source.attempt?.state === 'COMPLETE' ? 'Wing 카탈로그 수집 완료' : 'Wing 카탈로그 수집 실패'}</span>
    {source.error && <span className="text-destructive">{source.error}</span>}
    {source.isRunning && source.attempt?.state === 'RUNNING' && <button type="button" disabled={source.isCancelling}
      onClick={() => void source.cancel()}>수집 취소</button>}
    {!source.isRunning && (source.error || source.attempt?.state === 'FAILED') && <button type="button"
      onClick={() => void source.start()}>다시 수집</button>}
  </div>;
}
