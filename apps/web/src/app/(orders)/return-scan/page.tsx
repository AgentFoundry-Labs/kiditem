'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import ReturnScanHeader from './components/ReturnScanHeader';
import BarcodeScanInput from './components/BarcodeScanInput';
import ReturnProductInfo from './components/ReturnProductInfo';
import ScanLogTable from './components/ScanLogTable';

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

  const handleSubmit = () => {
    if (!barcode.trim()) return;
    setError(null);
    setSuccessMsg(null);
    setSubmitted(barcode.trim());
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
    setSuccessMsg(`"${returnInfo.name}" 회수 기록이 등록되었습니다.`);
    setReturnInfo(null);
    setBarcode('');
    setSubmitted('');
    setProcessing(false);
    inputRef.current?.focus();
  };

  const totalRecovered = scanLogs.filter((l) => l.success).length;

  return (
    <div className="space-y-6">
      <ReturnScanHeader totalRecovered={totalRecovered} />

      <BarcodeScanInput
        barcode={barcode}
        scanning={scanning}
        inputRef={inputRef}
        onBarcodeChange={setBarcode}
        onSubmit={handleSubmit}
      />

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

      {returnInfo && (
        <ReturnProductInfo
          product={returnInfo}
          processing={processing}
          onRecovery={handleRecovery}
        />
      )}

      <ScanLogTable logs={scanLogs} />
    </div>
  );
}
