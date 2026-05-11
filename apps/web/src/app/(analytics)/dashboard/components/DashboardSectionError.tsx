export function DashboardSectionError({
  msg,
  onRetry,
}: {
  msg?: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6">
      <p className="text-sm text-slate-500">{msg ?? '이 섹션을 불러올 수 없습니다'}</p>
      <button
        onClick={onRetry}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
      >
        다시 시도
      </button>
    </div>
  );
}
