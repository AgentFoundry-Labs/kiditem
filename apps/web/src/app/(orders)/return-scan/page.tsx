'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { InventorySkuSnapshotListResponseSchema } from '@kiditem/shared/inventory';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDateTime } from '@/lib/utils';
import ReturnScanHeader from './components/ReturnScanHeader';
import BarcodeScanInput from './components/BarcodeScanInput';
import ReturnProductInfo from './components/ReturnProductInfo';
import ScanLogTable from './components/ScanLogTable';

interface ProductInfo {
  id: string;
  name: string;
  sku: string | null;
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
    queryKey: queryKeys.inventory.snapshot({ query: submitted, limit: '10' }),
    queryFn: async () => {
      const result = await apiClient.getParsed(
        `/api/inventory/sellpia-skus?query=${encodeURIComponent(submitted)}&limit=10`,
        InventorySkuSnapshotListResponseSchema,
      );
      return {
        items: result.items.map((item): ProductInfo => ({
          id: item.sellpiaInventorySkuId,
          name: item.optionName ? `${item.name} · ${item.optionName}` : item.name,
          sku: item.code,
        })),
      };
    },
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
      timestamp: formatDateTime(new Date()),
      success: true,
      message: '회수 기록 완료 (Sellpia 재고 별도 반영)',
    };

    setScanLogs((prev) => [logEntry, ...prev]);
    setSuccessMsg(`"${returnInfo.name}" 회수 기록을 로컬에 추가했습니다. Sellpia 재고 반영은 별도 처리해야 합니다.`);
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
