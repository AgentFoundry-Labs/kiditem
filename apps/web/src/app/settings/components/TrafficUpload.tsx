'use client';

import { useRef, useState } from 'react';
import { BarChart3, CheckCircle, Loader2, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { apiClient } from '@/lib/api-client';

interface TrafficUploadResult {
  upserted?: number;
  skipped?: number;
  error?: string;
  detectedColumns?: string[];
}

export default function TrafficUpload() {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadResult, setUploadResult] = useState<TrafficUploadResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('uploading');
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const data = await apiClient.upload<TrafficUploadResult & { success?: boolean }>('/api/traffic/upload', formData);

      if (data.success) {
        setUploadStatus('success');
        setUploadResult(data);
        toast.success(`트래픽 데이터 업로드 완료 (${data.upserted}건)`);
      } else {
        setUploadStatus('error');
        setUploadResult({ error: data.error ?? '업로드 실패', detectedColumns: data.detectedColumns });
        toast.error(data.error ?? '업로드 실패');
      }
    } catch (err) {
      const msg = isApiError(err) ? err.detail : '업로드 실패';
      setUploadStatus('error');
      setUploadResult({ error: msg });
      toast.error(msg);
    }

    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
      <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <BarChart3 size={20} className="text-cyan-600" />
        트래픽 데이터 업로드
      </div>

      <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
        <div className="text-sm font-medium text-cyan-800 mb-2">Wing 트래픽 엑셀 업로드 방법</div>
        <ol className="text-xs text-cyan-700 space-y-1 list-decimal list-inside">
          <li>쿠팡 Wing 로그인 → 상품관리 → 상품별 통계</li>
          <li>&quot;기간별 엑셀 다운로드&quot; 또는 &quot;상품별 엑셀 다운로드&quot; 클릭</li>
          <li>아래 버튼으로 엑셀 파일 업로드 (방문자/조회/장바구니/주문/매출 자동 감지)</li>
        </ol>
      </div>

      <div className="flex items-center gap-4">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleUpload}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadStatus === 'uploading'}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 text-sm font-medium"
        >
          {uploadStatus === 'uploading' ? (
            <>
              <Loader2 size={16} className="animate-spin" /> 파싱 중...
            </>
          ) : (
            <>
              <Upload size={16} /> 트래픽 엑셀 업로드
            </>
          )}
        </button>

        {uploadStatus === 'success' && (
          <span className="text-green-600 text-sm flex items-center gap-1">
            <CheckCircle size={14} /> {uploadResult?.upserted}건 업로드 완료 (스킵: {uploadResult?.skipped}건)
          </span>
        )}
        {uploadStatus === 'error' && (
          <span className="text-red-600 text-sm flex items-center gap-1">
            <XCircle size={14} /> {uploadResult?.error ?? '실패'}
          </span>
        )}
      </div>
    </div>
  );
}
