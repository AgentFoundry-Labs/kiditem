export function SourceCollectionStatus({ source }: { source: {
  isCollecting: boolean; error: string | null; actualCutoffAt: string | null;
} }) {
  return <div className="text-sm text-[var(--text-secondary)]" aria-live="polite">
    {source.isCollecting && <p>수집 중… 기존 완료 스냅샷을 표시합니다.</p>}
    {source.error && <p role="alert" className="text-rose-700">{source.error} · 수집 버튼으로 재시도할 수 있습니다.</p>}
    {source.actualCutoffAt && <p>마지막 완료 기준: {new Date(source.actualCutoffAt).toLocaleString()}</p>}
  </div>;
}
