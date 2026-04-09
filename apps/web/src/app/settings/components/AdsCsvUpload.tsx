'use client';

import { useRef, useState } from 'react';
import { BarChart3, CheckCircle, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { apiClient } from '@/lib/api-client';

interface AdUploadStats {
  totalRows: number;
  inserted: number;
  uniqueProducts: number;
  unmatched: number;
  unmatchedSamples?: string[];
  summary: {
    totalSpend: number;
    totalImpressions: number;
    totalClicks: number;
    ctr: string;
    totalOrders1d: number;
    totalRevenue1d: number;
    totalRevenue14d: number;
    avgRoas: string;
  };
}

interface AdUploadResult {
  stats?: AdUploadStats;
  error?: string;
}

export default function AdsCsvUpload() {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadResult, setUploadResult] = useState<AdUploadResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('uploading');
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'adCsv');

      const data = await apiClient.upload<AdUploadResult & { success?: boolean }>('/api/upload', formData);

      if (data.success) {
        setUploadStatus('success');
        setUploadResult(data);
        toast.success('광고 CSV 업로드 완료');
      } else {
        setUploadStatus('error');
        setUploadResult({ error: data.error ?? '업로드 실패' });
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
    <div className="bg-white rounded-xl p-6 border border-slate-200">
      <h2 className="font-semibold text-lg text-slate-900 mb-2 flex items-center gap-2">
        <BarChart3 size={20} className="text-purple-600" />
        쿠팡 광고센터 데이터 업로드
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        쿠팡 광고센터(advertising.coupang.com)에서 다운로드한 CSV 파일을 업로드하면 실제 광고 성과 데이터가 반영됩니다.
      </p>

      <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 mb-4">
        <div className="text-sm text-purple-800 mb-2 font-medium">업로드 방법:</div>
        <ol className="text-xs text-purple-700 space-y-1 list-decimal list-inside">
          <li>쿠팡 광고센터 로그인 → 보고서 → 캠페인 보고서 다운로드</li>
          <li>
            파일명 예시:{' '}
            <code className="bg-purple-100 px-1 rounded">A00057379_pa_total_campaign_*.csv</code>
          </li>
          <li>아래 버튼으로 CSV 파일 업로드</li>
        </ol>
      </div>

      <div className="flex items-center gap-4">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleUpload}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadStatus === 'uploading'}
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
        >
          {uploadStatus === 'uploading' ? (
            <>
              <Loader2 size={16} className="animate-spin" /> 파싱 중...
            </>
          ) : (
            <>
              <Upload size={16} /> 광고 CSV 업로드
            </>
          )}
        </button>

        {uploadStatus === 'success' && (
          <span className="text-green-600 text-sm flex items-center gap-1">
            <CheckCircle size={14} /> 업로드 완료
          </span>
        )}
        {uploadStatus === 'error' && (
          <span className="text-red-600 text-sm flex items-center gap-1">
            <XCircle size={14} /> {uploadResult?.error ?? '실패'}
          </span>
        )}
      </div>

      {uploadResult?.stats && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-500">총 행 수</div>
              <div className="text-lg font-bold text-slate-900">
                {uploadResult.stats.totalRows.toLocaleString('ko-KR')}
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-xs text-green-600">매칭/저장</div>
              <div className="text-lg font-bold text-green-700">
                {uploadResult.stats.inserted.toLocaleString('ko-KR')}
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-xs text-purple-600">매칭 상품수</div>
              <div className="text-lg font-bold text-blue-700">
                {uploadResult.stats.uniqueProducts}
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 text-center">
              <div className="text-xs text-orange-600">미매칭</div>
              <div className="text-lg font-bold text-orange-700">
                {uploadResult.stats.unmatched}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <div className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
              <FileSpreadsheet size={14} /> 광고 성과 요약
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-slate-500">총 광고비</span>
                <div className="font-bold">
                  {uploadResult.stats.summary.totalSpend.toLocaleString('ko-KR')}원
                </div>
              </div>
              <div>
                <span className="text-slate-500">총 노출수</span>
                <div className="font-bold">
                  {uploadResult.stats.summary.totalImpressions.toLocaleString('ko-KR')}
                </div>
              </div>
              <div>
                <span className="text-slate-500">총 클릭수</span>
                <div className="font-bold">
                  {uploadResult.stats.summary.totalClicks.toLocaleString('ko-KR')}
                </div>
              </div>
              <div>
                <span className="text-slate-500">CTR</span>
                <div className="font-bold">{uploadResult.stats.summary.ctr}</div>
              </div>
              <div>
                <span className="text-slate-500">총 주문수(1일)</span>
                <div className="font-bold">{uploadResult.stats.summary.totalOrders1d}</div>
              </div>
              <div>
                <span className="text-slate-500">전환매출(1일)</span>
                <div className="font-bold">
                  {uploadResult.stats.summary.totalRevenue1d.toLocaleString('ko-KR')}원
                </div>
              </div>
              <div>
                <span className="text-slate-500">전환매출(14일)</span>
                <div className="font-bold">
                  {uploadResult.stats.summary.totalRevenue14d.toLocaleString('ko-KR')}원
                </div>
              </div>
              <div>
                <span className="text-slate-500">평균 ROAS(14일)</span>
                <div className="font-bold text-purple-600">{uploadResult.stats.summary.avgRoas}</div>
              </div>
            </div>
          </div>

          {(uploadResult.stats.unmatchedSamples?.length ?? 0) > 0 && (
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="text-sm font-medium text-orange-700 mb-1">
                미매칭 상품 샘플 ({uploadResult.stats.unmatched}건)
              </div>
              <div className="text-xs text-orange-600 space-y-0.5">
                {uploadResult.stats.unmatchedSamples!.map((n, i) => (
                  <div key={i}>· {n}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
