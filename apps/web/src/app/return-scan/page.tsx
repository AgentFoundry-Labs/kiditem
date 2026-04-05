'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScanBarcode,
  PackagePlus,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Package,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface ProductInfo {
  id: string;
  name: string;
  sku: string | null;
  currentStock: number;
}

interface ScanLog {
  barcode: string;
  productName: string;
  timestamp: string;
  success: boolean;
  message: string;
}

export default function ReturnScanPage() {
  const [barcode, setBarcode] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [returnInfo, setReturnInfo] = useState<ProductInfo | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: searchData, isLoading: scanning } = useQuery({
    queryKey: queryKeys.products.list({ search: submitted }),
    queryFn: () =>
      apiClient.get<{ items: ProductInfo[] }>(
        `/api/products?search=${encodeURIComponent(submitted)}`
      ),
    enabled: !!submitted,
  });

  // Auto-select first match (local state sync — useEffect exception)
  const searchResults = searchData?.items ?? [];
  useEffect(() => {
    if (submitted && searchResults.length > 0 && !returnInfo && !scanning) {
      setReturnInfo(searchResults[0]);
    }
  }, [submitted, searchResults, returnInfo, scanning]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (!barcode.trim()) return;
      setError(null);
      setSuccessMsg(null);
      setSubmitted(barcode.trim());
    }
  };

  const handleRecovery = () => {
    if (!returnInfo) return;
    setProcessing(true);
    setError(null);

    const logEntry: ScanLog = {
      barcode: barcode || returnInfo.sku || returnInfo.id,
      productName: returnInfo.name,
      timestamp: new Date().toLocaleString('ko-KR'),
      success: true,
      message: '회수 완료 (재고 반영 대기)',
    };

    setScanLogs((prev) => [logEntry, ...prev]);
    setSuccessMsg(
      `"${returnInfo.name}" 회수 기록이 등록되었습니다.`
    );
    setReturnInfo(null);
    setBarcode('');
    setSubmitted('');
    setProcessing(false);
    inputRef.current?.focus();
  };

  const totalRecovered = scanLogs.filter((l) => l.success).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <ScanBarcode size={24} className="inline mr-2" />
          반품 바코드 회수처리
        </h1>
        <div className="text-sm text-slate-500">
          오늘 회수:{' '}
          <strong className="text-green-600">{totalRecovered}건</strong>
        </div>
      </div>

      {/* 바코드 입력 */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 rounded-t-xl">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            바코드 스캔 / 입력
          </h3>
        </div>
        <div className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <ScanBarcode
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="바코드를 스캔하거나 SKU/상품명 입력 후 Enter..."
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <button
              disabled={!barcode.trim() || scanning}
              onClick={() => {
                if (!barcode.trim()) return;
                setError(null);
                setSuccessMsg(null);
                setSubmitted(barcode.trim());
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {scanning ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                '조회'
              )}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            바코드 스캐너로 자동입력하거나, 직접 SKU/상품명을 입력하세요.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}

      {/* 반품 정보 */}
      {returnInfo && (
        <div className="bg-white rounded-xl border border-blue-200">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 rounded-t-xl">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              반품 상품 정보
            </h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-xs text-slate-500">상품명</div>
                <div className="text-sm font-medium">
                  {returnInfo.name}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">SKU</div>
                <div className="text-sm font-mono">{returnInfo.sku || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">현재 재고</div>
                <div className="text-sm">{returnInfo.currentStock}개</div>
              </div>
            </div>
            <button
              onClick={handleRecovery}
              disabled={processing}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {processing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <PackagePlus size={16} />
              )}
              회수 완료 (재고 +1)
            </button>
          </div>
        </div>
      )}

      {/* 회수 로그 */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 rounded-t-xl">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            회수 처리 로그
          </h3>
        </div>
        {scanLogs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Package size={48} className="mx-auto mb-3 opacity-30" />
            <p>회수 기록이 없습니다</p>
            <p className="text-xs mt-1">
              바코드를 스캔하여 반품을 회수하세요
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <th className="px-4 py-3">시각</th>
                  <th className="px-4 py-3">바코드</th>
                  <th className="px-4 py-3">상품</th>
                  <th className="px-4 py-3">결과</th>
                  <th className="px-4 py-3">메시지</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scanLogs.map((log, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <Clock size={10} className="inline mr-1" />
                      {log.timestamp}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {log.barcode}
                    </td>
                    <td className="px-4 py-3 text-sm">{log.productName}</td>
                    <td className="px-4 py-3">
                      {log.success ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          성공
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          실패
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {log.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
