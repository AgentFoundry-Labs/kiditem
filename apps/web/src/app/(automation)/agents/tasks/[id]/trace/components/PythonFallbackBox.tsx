import { Terminal } from 'lucide-react';

interface PythonFallbackBoxProps {
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
  resultJson: unknown;
}

/**
 * Python adapter 실행 시에는 AgentEvent 가 없고 HeartbeatRun.stdout/stderr 만 남는다.
 * 이벤트 0건 run 에 대해 이 박스로 대체 표시.
 */
export function PythonFallbackBox({ stdoutExcerpt, stderrExcerpt, resultJson }: PythonFallbackBoxProps) {
  const resultStr =
    resultJson == null ? '-' : (() => {
      try {
        return JSON.stringify(resultJson, null, 2);
      } catch {
        return String(resultJson);
      }
    })();

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        <Terminal className="w-3 h-3" />
        <span>이벤트 없음 — Python adapter 출력</span>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-slate-600 hover:text-slate-900">stdout</summary>
        <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700 bg-white border border-slate-200 rounded p-2 max-h-40 overflow-y-auto">
          {stdoutExcerpt ?? '-'}
        </pre>
      </details>
      <details className="text-xs mt-1">
        <summary className="cursor-pointer text-slate-600 hover:text-slate-900">stderr</summary>
        <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-red-700 bg-white border border-slate-200 rounded p-2 max-h-40 overflow-y-auto">
          {stderrExcerpt ?? '-'}
        </pre>
      </details>
      <details className="text-xs mt-1">
        <summary className="cursor-pointer text-slate-600 hover:text-slate-900">result JSON</summary>
        <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700 bg-white border border-slate-200 rounded p-2 max-h-60 overflow-y-auto">
          {resultStr}
        </pre>
      </details>
    </div>
  );
}
