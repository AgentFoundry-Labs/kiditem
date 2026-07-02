import type { ChangeEvent, DragEvent, RefObject } from 'react';
import { AlertCircle, CheckCircle2, Clock, Download, Eye, FileSpreadsheet, Loader2, LockKeyhole, Upload } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import {
  ACCEPTED_EXTENSIONS,
  fileSizeLabel,
  stateMessage,
  type ConversionHistoryItem,
  type ConversionState,
} from '../lib/order-collection-page-model';

interface ManualUploadSectionProps {
  inputRef: RefObject<HTMLInputElement | null>;
  selectedFile: File | null;
  filePassword: string;
  state: ConversionState;
  dragActive: boolean;
  error: string | null;
  canConvert: boolean;
  lastResult: ConversionHistoryItem | null;
  onDragActiveChange: (active: boolean) => void;
  onFilePasswordChange: (value: string) => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onConvert: () => void;
  onDownload: (item: ConversionHistoryItem) => void;
  onPreview: (id: string) => void;
}

export function ManualUploadSection({
  inputRef,
  selectedFile,
  filePassword,
  state,
  dragActive,
  error,
  canConvert,
  lastResult,
  onDragActiveChange,
  onFilePasswordChange,
  onInputChange,
  onDrop,
  onConvert,
  onDownload,
  onPreview,
}: ManualUploadSectionProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">수동 업로드</div>
          <div className="text-xs text-slate-500">업로드된 상품 주문 행 전체를 납품 양식으로 변환</div>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          아이스크림몰
        </span>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            onDragActiveChange(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => onDragActiveChange(false)}
          onDrop={onDrop}
          className={cn(
            'flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed px-5 py-6 text-center transition-colors',
            dragActive ? 'border-purple-400 bg-purple-50' : 'border-slate-300 bg-slate-50/70',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={onInputChange}
            className="hidden"
          />
          <FileSpreadsheet size={34} className="text-slate-400" />
          <div className="mt-3 text-sm font-medium text-slate-900">
            {selectedFile ? selectedFile.name : '주문 파일'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {selectedFile ? fileSizeLabel(selectedFile.size) : ACCEPTED_EXTENSIONS}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={state === 'converting'}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Upload size={15} />
              선택
            </button>
            <button
              type="button"
              onClick={onConvert}
              disabled={!canConvert}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === 'converting' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              변환
            </button>
          </div>
          <label className="mt-4 w-full max-w-sm text-left">
            <span className="text-xs font-medium text-slate-600">파일 비밀번호</span>
            <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-slate-400">
              <LockKeyhole size={15} className="shrink-0 text-slate-400" />
              <input
                type="password"
                value={filePassword}
                onChange={(event) => onFilePasswordChange(event.target.value)}
                disabled={state === 'converting'}
                placeholder="비밀번호가 있을 때 입력"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50"
              />
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {stateIcon(state)}
            상태
          </div>
          <div className="mt-3 text-sm text-slate-600">{stateMessage(state, selectedFile, error)}</div>
          {lastResult && (
            <div className="mt-4 rounded-md bg-white p-3 text-xs text-slate-600">
              <div className="break-words font-medium text-slate-900">{lastResult.fileName}</div>
              <div className="mt-1 flex items-center gap-1">
                <Clock size={12} />
                {formatDateTime(lastResult.convertedAt)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onDownload(lastResult)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download size={13} />
                  다운로드
                </button>
                <button
                  type="button"
                  onClick={() => onPreview(lastResult.id)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Eye size={13} />
                  미리보기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function stateIcon(state: ConversionState) {
  if (state === 'converting') return <Loader2 size={15} className="animate-spin text-purple-600" />;
  if (state === 'success') return <CheckCircle2 size={15} className="text-emerald-600" />;
  if (state === 'error') return <AlertCircle size={15} className="text-red-600" />;
  return <Clock size={15} className="text-slate-500" />;
}
