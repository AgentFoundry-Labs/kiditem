'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Download, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface UploadRow {
  [key: string]: string | number | undefined;
}

interface UploadResult {
  row: number;
  name: string;
  action: 'created' | 'updated' | 'error';
  message?: string;
}

interface UploadResponse {
  success: boolean;
  summary: { total: number; created: number; updated: number; errors: number };
  results: UploadResult[];
}

interface ParsedFile {
  fileName: string;
  columns: string[];
  rows: UploadRow[];
  originalRowCount: number;
}

const REQUIRED_COLUMNS = ['상품명'];
const TEMPLATE_COLUMNS = ['상품명', 'SKU', '카테고리', '회사', '공급가(원)', '원가(원)', '판매가', '수수료율(%)', '배송비', '관리등급', '상태', '1월', '2월', '3월', '비고'];

interface Props {
  onClose: () => void;
  onComplete: () => void;
}

export default function ExcelUploadModal({ onClose, onComplete }: Props) {
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [datasets, setDatasets] = useState<ParsedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; summary: { total: number; created: number; updated: number; errors: number }; results: (UploadResult & { fileName: string })[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setDatasets([]);
    setUploading(false);
    setResult(null);
    setError(null);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);
    const parsed: ParsedFile[] = [];
    try {
      const XLSX = await import('xlsx');
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) { setError(`파일 크기가 10MB를 초과합니다: ${file.name}`); return; }
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '', blankrows: false });
        if (rawRows.length < 2) { setError(`데이터가 비어있습니다: ${file.name}`); return; }
        const headers = (rawRows[0] as (string | number)[]).map((v) => String(v ?? '').replace(/\s+/g, '').trim());
        const rows: UploadRow[] = rawRows.slice(1).map((rawRow) => {
          const row: UploadRow = {};
          headers.forEach((h, i) => { if (h) row[h] = (rawRow as (string | number)[])[i] as string | number | undefined; });
          return row;
        }).filter((r) => Object.values(r).some((v) => v !== '' && v !== undefined && v !== null));
        if (rows.length > 5000) { setError(`최대 5,000행까지 업로드 가능합니다. (${file.name}: ${rows.length}행)`); return; }
        const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
        if (missing.length > 0) { setError(`${file.name}: 필수 컬럼이 없습니다: ${missing.join(', ')}`); return; }
        parsed.push({ fileName: file.name, columns: headers.filter(Boolean), rows, originalRowCount: rows.length });
      }
      setDatasets(parsed);
      setStep('preview');
    } catch { setError('엑셀 파일을 읽는 중 오류가 발생했습니다.'); }
  };

  const handleUpload = async () => {
    // Bulk Excel upload depends on a legacy /api/products/upload endpoint that no longer
    // exists in the 3-layer contract. UI stays reachable for continuity, but the upload
    // action is unwired. Canonical bulk-create flow (master + options + inventory) is a
    // follow-up under the agent/workflow redesign.
    setError('엑셀 일괄 업로드는 새 계약 기반으로 재설계 중입니다. 상품 추가 버튼으로 개별 등록해 주세요.');
  };

  const handleDownloadTemplate = () => {
    import('xlsx').then((XLSX) => {
      const ws = XLSX.utils.aoa_to_sheet([
        TEMPLATE_COLUMNS,
        ['샘플상품A', 'SKU-001', '생활용품', '회사A', 9600, 7000, 12000, 10, 3000, '핵심', '판매중', 120, 80, 95, ''],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '상품등록양식');
      XLSX.writeFile(wb, '상품등록_양식.xlsx');
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-[560px] max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[18px] font-bold text-slate-900">엑셀 업로드</div>
            <div className="text-[12px] text-slate-400 mt-0.5 font-mono">Bulk Import</div>
          </div>
          <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {step === 'upload' && (
          <div className="space-y-4">
            <div
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-purple-400 hover:bg-purple-50/30 transition-colors cursor-pointer"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file'; input.multiple = true; input.accept = '.xlsx,.xls,.csv';
                input.onchange = (e) => { const files = (e.target as HTMLInputElement).files; if (files) handleFiles(files); };
                input.click();
              }}
            >
              <Upload size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-slate-600 font-medium">파일을 드래그하거나 클릭하여 업로드</p>
              <p className="text-xs text-slate-400 mt-1">여러 파일 선택 가능 | .xlsx, .xls, .csv | 최대 5,000행</p>
            </div>
            {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm"><XCircle size={14} />{error}</div>}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button onClick={handleDownloadTemplate} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Download size={13} /> 양식 다운로드
              </button>
              <div className="text-[10px] text-slate-400 text-right">필수: 상품명</div>
            </div>
          </div>
        )}

        {step === 'preview' && datasets.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet size={16} className="text-green-600" />
              <span className="font-medium text-slate-700">{datasets.length}개 파일 준비됨</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">{datasets.reduce((s, d) => s + d.rows.length, 0)}건</span>
            </div>
            {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm"><XCircle size={14} />{error}</div>}
            <div className="space-y-2">
              {datasets.map((d) => (
                <div key={d.fileName} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <div className="font-medium text-slate-800">{d.fileName}</div>
                  <div className="text-slate-500">{d.rows.length.toLocaleString()}건</div>
                </div>
              ))}
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[280px] overflow-y-auto">
              <table className="text-xs w-full">
                <thead><tr className="bg-slate-50 border-b border-slate-200">{datasets[0].columns.map((c) => <th key={c} className="px-3 py-2 text-left text-slate-500 font-semibold whitespace-nowrap">{c}</th>)}</tr></thead>
                <tbody>
                  {datasets[0].rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {datasets[0].columns.map((c) => <td key={c} className="px-3 py-2 text-slate-700 max-w-[120px] truncate">{row[c] ?? '-'}</td>)}
                    </tr>
                  ))}
                  {datasets[0].rows.length > 20 && <tr><td colSpan={datasets[0].columns.length} className="text-center text-slate-400 py-2 text-xs">... 외 {datasets[0].rows.length - 20}건</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center">
              <button onClick={reset} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">다시 선택</button>
              <div className="flex gap-2">
                <button onClick={handleClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">취소</button>
                <button onClick={handleUpload} disabled={uploading}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
                  style={{ background: 'var(--primary)' }}>
                  {uploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload size={14} />}
                  {datasets.length}개 파일 업로드
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'TOTAL', value: result.summary.total, bg: 'bg-slate-50', text: 'text-slate-900' },
                { label: 'CREATED', value: result.summary.created, bg: 'bg-green-50', text: 'text-green-700' },
                { label: 'UPDATED', value: result.summary.updated, bg: 'bg-blue-50', text: 'text-blue-700' },
                { label: 'ERRORS', value: result.summary.errors, bg: 'bg-red-50', text: 'text-red-700' },
              ].map((s) => (
                <div key={s.label} className={`text-center p-3 rounded-lg ${s.bg}`}>
                  <div className={`text-lg font-bold ${s.text}`}>{s.value}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{s.label}</div>
                </div>
              ))}
            </div>
            {result.summary.errors === 0
              ? <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-50 text-green-700 text-sm"><CheckCircle size={15} />모든 상품이 성공적으로 처리되었습니다.</div>
              : result.summary.errors < result.summary.total
                ? <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-yellow-50 text-yellow-700 text-sm"><AlertTriangle size={15} />일부 항목에 오류가 있습니다. 성공한 항목은 반영되었습니다.</div>
                : null
            }
            <div className="flex justify-end">
              <button onClick={() => { handleClose(); onComplete(); }}
                className="px-4 py-2 text-sm font-semibold text-white rounded-lg"
                style={{ background: 'var(--primary)' }}>확인</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
