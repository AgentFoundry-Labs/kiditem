'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Trash2 } from 'lucide-react';
import { downloadBlob } from '@/lib/browser-download';
import { formatDateTime, formatNumber } from '@/lib/utils';
import {
  deleteRocketConfirmFile,
  loadRocketConfirmFiles,
  ROCKET_CONFIRM_FILES_CHANGED_EVENT,
  type StoredRocketConfirmFile,
} from '@/lib/rocket-confirm-file-store';

export function RocketConfirmFileList({ refreshKey }: { refreshKey: number }) {
  const [files, setFiles] = useState<StoredRocketConfirmFile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    loadRocketConfirmFiles()
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(ROCKET_CONFIRM_FILES_CHANGED_EVENT, load);
    return () => window.removeEventListener(ROCKET_CONFIRM_FILES_CHANGED_EVENT, load);
  }, [load, refreshKey]);

  async function handleDelete(id: string) {
    await deleteRocketConfirmFile(id);
    load();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={16} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">쿠팡 엑셀 다운로드 이력</span>
        </div>
        <span className="text-xs tabular-nums text-slate-400">{files.length}개</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-5 py-6 text-xs text-slate-500">
          <Loader2 size={14} className="animate-spin text-purple-600" /> 불러오는 중…
        </div>
      ) : files.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">저장된 파일 이력이 없습니다.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-5 py-2.5">
              <FileSpreadsheet size={16} className="flex-none text-emerald-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800">{f.fileName}</div>
                <div className="text-[11px] text-slate-400">
                  {formatDateTime(f.createdAt)} · {formatNumber(f.totalRows)}행 · 전량확정 {formatNumber(f.fullyConfirmed)} · 부족 {formatNumber(f.shortRows)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadBlob(f.blob, f.fileName)}
                className="inline-flex flex-none items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download size={13} /> 다운로드
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(f.id)}
                className="inline-flex flex-none items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                title="삭제"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
