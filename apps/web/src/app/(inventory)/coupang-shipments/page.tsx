'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Loader2,
  PackageCheck,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadBlob } from '@/lib/browser-download';
import { cn, formatNumber } from '@/lib/utils';
import {
  COUPANG_SHIPMENT_CENTERS,
  COUPANG_SHIPMENT_PAGE_URL,
  classifyCoupangShipmentFile,
  displayKind,
  mergeCoupangShipmentFiles,
  sortCoupangShipmentFiles,
  todayKey,
  type CoupangShipmentFileDraft,
  type CoupangShipmentFileKind,
  type CoupangShipmentMergedFile,
} from './lib/coupang-shipment-files';
import {
  clickCoupangShipmentDownloadsViaExtension,
  openCoupangShipmentPageViaExtension,
} from './lib/coupang-shipment-extension';
import {
  downloadCoupangShipmentServerFile,
  loadCoupangShipmentServerFiles,
  type CoupangShipmentServerDay,
  type CoupangShipmentServerFile,
  type CoupangShipmentServerFileKind,
} from './lib/coupang-shipment-api';
import {
  deleteCoupangShipmentFile,
  loadCoupangShipmentFiles,
  saveCoupangShipmentFiles,
} from './lib/coupang-shipment-store';

type DownloadMode = 'both' | 'label' | 'statement';
type ResultKind = CoupangShipmentFileKind | CoupangShipmentServerFileKind;

type ResultFile =
  | {
      source: 'server';
      id: string;
      kind: CoupangShipmentServerFileKind;
      shipmentDate: string;
      centers: string[];
      sourceCount: number;
      pageCount: number;
      fileName: string;
      createdAt: number;
      sizeBytes: number;
      serverFile: CoupangShipmentServerFile;
    }
  | {
      source: 'browser';
      id: string;
      kind: CoupangShipmentFileKind;
      shipmentDate: string;
      centers: string[];
      sourceCount: number;
      pageCount: number;
      fileName: string;
      createdAt: number;
      blob: Blob;
    };

const KIND_OPTIONS: Array<{ value: CoupangShipmentFileKind; label: string }> = [
  { value: 'label', label: 'Label' },
  { value: 'statement', label: '내역서' },
];

export default function CoupangShipmentsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<CoupangShipmentFileDraft[]>([]);
  const [history, setHistory] = useState<CoupangShipmentMergedFile[]>([]);
  const [serverHistory, setServerHistory] = useState<CoupangShipmentServerDay[]>([]);
  const [serverHistoryLoading, setServerHistoryLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [merging, setMerging] = useState(false);
  const [extensionBusy, setExtensionBusy] = useState(false);
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('both');
  const [downloadDate, setDownloadDate] = useState(todayKey());

  const refreshServerHistory = useCallback(async () => {
    setServerHistoryLoading(true);
    try {
      const response = await loadCoupangShipmentServerFiles();
      setServerHistory(response.days);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '쿠팡 쉽먼트 결과를 불러오지 못했습니다.');
      setServerHistory([]);
    } finally {
      setServerHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadCoupangShipmentFiles()
      .then((files) => {
        if (active) setHistory(files);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void refreshServerHistory();
  }, [refreshServerHistory]);

  const sortedDrafts = useMemo(() => sortCoupangShipmentFiles(drafts), [drafts]);
  const historyByDate = useMemo(() => groupHistoryByDate(history, serverHistory), [history, serverHistory]);
  const labelDraftCount = drafts.filter((item) => item.kind === 'label').length;
  const statementDraftCount = drafts.filter((item) => item.kind === 'statement').length;
  const totalResultCount = history.length + serverHistory.reduce((sum, day) => sum + day.files.length, 0);
  const todayHistoryCount =
    history.filter((item) => item.shipmentDate === todayKey()).length +
    (serverHistory.find((day) => day.date === todayKey())?.files.length ?? 0);

  const addFiles = (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter(
      (file) => file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf'),
    );
    if (pdfs.length === 0) {
      toast.error('PDF 파일만 업로드할 수 있습니다.');
      return;
    }
    const fallbackDate = downloadDate || todayKey();
    setDrafts((current) => [
      ...current,
      ...pdfs.map((file) => classifyCoupangShipmentFile(file, fallbackDate)),
    ]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    addFiles(event.dataTransfer.files);
  };

  const updateDraft = (id: string, patch: Partial<Pick<CoupangShipmentFileDraft, 'kind' | 'shipmentDate' | 'center'>>) => {
    setDrafts((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeDraft = (id: string) => {
    setDrafts((current) => current.filter((item) => item.id !== id));
  };

  const openCoupang = async () => {
    setExtensionBusy(true);
    try {
      await openCoupangShipmentPageViaExtension();
      toast.success('쿠팡 쉽먼트 화면을 열었습니다.');
    } catch (error) {
      window.open(COUPANG_SHIPMENT_PAGE_URL, '_blank', 'noopener,noreferrer');
      toast.error(error instanceof Error ? error.message : '쿠팡 쉽먼트 화면을 열지 못했습니다.');
    } finally {
      setExtensionBusy(false);
    }
  };

  const clickDownloads = async () => {
    setExtensionBusy(true);
    try {
      const result = await clickCoupangShipmentDownloadsViaExtension({
        date: downloadDate,
        labels: downloadMode === 'both' || downloadMode === 'label',
        statements: downloadMode === 'both' || downloadMode === 'statement',
      });
      toast.success(
        `다운로드 실행 Label ${formatNumber(result.labelCount ?? 0)}개 · 내역서 ${formatNumber(result.statementCount ?? 0)}개`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '쿠팡 다운로드 실행 실패');
    } finally {
      setExtensionBusy(false);
    }
  };

  const mergeFiles = async () => {
    if (drafts.length === 0) {
      toast.error('병합할 PDF를 추가해주세요.');
      return;
    }
    setMerging(true);
    try {
      const results = await mergeCoupangShipmentFiles(drafts);
      const mergedFiles = results.flatMap((result) => result.files);
      await saveCoupangShipmentFiles(mergedFiles);
      setHistory((current) => [...mergedFiles, ...current].sort((a, b) => b.createdAt - a.createdAt));
      setDrafts([]);
      toast.success(`쿠팡 쉽먼트 PDF ${formatNumber(mergedFiles.length)}개 생성 완료`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'PDF 병합 실패');
    } finally {
      setMerging(false);
    }
  };

  const deleteHistory = async (id: string) => {
    await deleteCoupangShipmentFile(id);
    setHistory((current) => current.filter((item) => item.id !== id));
  };

  const downloadResultFile = async (file: ResultFile) => {
    try {
      if (file.source === 'server') {
        const blob = await downloadCoupangShipmentServerFile(file.serverFile);
        downloadBlob(blob, file.fileName);
        return;
      }
      downloadBlob(file.blob, file.fileName);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '파일 다운로드 실패');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <PackageCheck size={20} className="text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">쿠팡 쉽먼트</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCoupang}
            disabled={extensionBusy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ExternalLink size={15} />
            쿠팡 열기
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            <Upload size={15} />
            PDF 추가
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="대기 Label" value={labelDraftCount} tone="default" />
        <SummaryCard label="대기 내역서" value={statementDraftCount} tone="purple" />
        <SummaryCard label="생성 파일" value={totalResultCount} tone="default" />
        <SummaryCard label="오늘 결과" value={todayHistoryCount} tone="default" />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">다운로드</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={downloadDate}
              onChange={(event) => setDownloadDate(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 outline-none focus:border-slate-400"
            />
            <select
              value={downloadMode}
              onChange={(event) => setDownloadMode(event.target.value as DownloadMode)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 outline-none focus:border-slate-400"
            >
              <option value="both">Label + 내역서</option>
              <option value="label">Label</option>
              <option value="statement">내역서</option>
            </select>
            <button
              type="button"
              onClick={clickDownloads}
              disabled={extensionBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {extensionBusy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              화면 다운로드
            </button>
          </div>
        </div>

        <div
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            'm-5 flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed px-5 py-6 text-center transition-colors',
            dragActive ? 'border-purple-400 bg-purple-50' : 'border-slate-300 bg-slate-50/70',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.currentTarget.value = '';
            }}
            className="hidden"
          />
          <FileArchive size={34} className="text-slate-400" />
          <div className="mt-3 text-sm font-medium text-slate-900">Label · 내역서 PDF</div>
          <div className="mt-1 text-xs text-slate-400">.pdf</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">병합 대기</div>
          <button
            type="button"
            onClick={mergeFiles}
            disabled={drafts.length === 0 || merging}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {merging ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            병합
          </button>
        </div>

        {sortedDrafts.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-400">
            <AlertCircle size={15} />
            대기 파일 없음
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">파일</th>
                  <th className="px-4 py-3 text-left">종류</th>
                  <th className="px-4 py-3 text-left">일자</th>
                  <th className="px-4 py-3 text-left">센터</th>
                  <th className="px-4 py-3 text-right">작업</th>
                </tr>
              </thead>
              <tbody>
                {sortedDrafts.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="max-w-[420px] truncate px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3">
                      <select
                        value={item.kind}
                        onChange={(event) => updateDraft(item.id, { kind: event.target.value as CoupangShipmentFileKind })}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none focus:border-slate-400"
                      >
                        {KIND_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={item.shipmentDate}
                        onChange={(event) => updateDraft(item.id, { shipmentDate: event.target.value })}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none focus:border-slate-400"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={item.center}
                        onChange={(event) => updateDraft(item.id, { center: event.target.value })}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none focus:border-slate-400"
                      >
                        {centerOptions(item.center).map((center) => (
                          <option key={center} value={center}>
                            {center}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeDraft(item.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                        aria-label={`${item.name} 삭제`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">일별 결과</div>
          <button
            type="button"
            onClick={() => void refreshServerHistory()}
            disabled={serverHistoryLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {serverHistoryLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            새로고침
          </button>
        </div>

        {historyByDate.length === 0 && !serverHistoryLoading ? (
          <div className="px-5 py-8 text-sm text-slate-400">생성 파일 없음</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {historyByDate.map((group) => (
              <div key={group.date} className="p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-semibold tabular-nums text-slate-900">{group.date}</div>
                  <div className="text-xs text-slate-400">{formatNumber(group.files.length)}개</div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {group.files.map((file) => (
                    <div key={file.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-semibold text-slate-900">{file.fileName}</div>
                            {file.source === 'server' ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                수집
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {displayResultKind(file.kind)} · {formatNumber(file.sourceCount)}개 · {formatNumber(file.pageCount)}p
                            {file.source === 'server' ? ` · ${formatFileSize(file.sizeBytes)}` : ''}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-400">{file.centers.join(' · ')}</div>
                        </div>
                        <div className="flex flex-none items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void downloadResultFile(file)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                            aria-label={`${file.fileName} 다운로드`}
                          >
                            <Download size={14} />
                          </button>
                          {file.source === 'browser' ? (
                            <button
                              type="button"
                              onClick={() => void deleteHistory(file.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                              aria-label={`${file.fileName} 삭제`}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'default' | 'purple' }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-5 py-4',
        tone === 'purple' ? 'border-purple-200 bg-purple-50' : 'border-slate-200 bg-white',
      )}
    >
      <div className={cn('text-xs font-medium', tone === 'purple' ? 'text-purple-700' : 'text-slate-500')}>
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums tracking-tight',
          tone === 'purple' ? 'text-purple-700' : 'text-slate-900',
        )}
      >
        {formatNumber(value)}
      </div>
    </div>
  );
}

function groupHistoryByDate(
  browserFiles: CoupangShipmentMergedFile[],
  serverDays: CoupangShipmentServerDay[],
): Array<{ date: string; files: ResultFile[] }> {
  const byDate = new Map<string, ResultFile[]>();
  for (const day of serverDays) {
    const list = byDate.get(day.date) ?? [];
    list.push(
      ...day.files.map((file): ResultFile => ({
        source: 'server',
        id: `server-${file.id}`,
        kind: file.kind,
        shipmentDate: file.date,
        centers: file.centers,
        sourceCount: file.sourceCount,
        pageCount: file.pageCount,
        fileName: file.fileName,
        createdAt: new Date(file.createdAt).getTime(),
        sizeBytes: file.sizeBytes,
        serverFile: file,
      })),
    );
    byDate.set(day.date, list);
  }

  for (const file of browserFiles) {
    const list = byDate.get(file.shipmentDate) ?? [];
    list.push({
      source: 'browser',
      id: file.id,
      kind: file.kind,
      shipmentDate: file.shipmentDate,
      centers: file.centers,
      sourceCount: file.sourceCount,
      pageCount: file.pageCount,
      fileName: file.fileName,
      createdAt: file.createdAt,
      blob: file.blob,
    });
    byDate.set(file.shipmentDate, list);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      files: [...items].sort((a, b) => resultKindRank(a.kind) - resultKindRank(b.kind) || b.createdAt - a.createdAt),
    }));
}

function displayResultKind(kind: ResultKind): string {
  if (kind === 'all') return '전체';
  return displayKind(kind);
}

function resultKindRank(kind: ResultKind): number {
  if (kind === 'all') return 0;
  if (kind === 'label') return 1;
  return 2;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes}B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)}KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)}MB`;
}

function centerOptions(current: string): string[] {
  return COUPANG_SHIPMENT_CENTERS.includes(current as (typeof COUPANG_SHIPMENT_CENTERS)[number])
    ? [...COUPANG_SHIPMENT_CENTERS]
    : [current, ...COUPANG_SHIPMENT_CENTERS];
}
