'use client';

import { useState } from 'react';
import { Settings } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import CoupangTab from './components/CoupangTab';
import AdsCsvUpload from './components/AdsCsvUpload';
import TrafficUpload from './components/TrafficUpload';
import ReportDownload from './components/ReportDownload';
import PrinterSettings from './components/PrinterSettings';

export interface SyncResult {
  synced: number;
  errors: number;
  details?: string[];
}

export interface HealthResult {
  connected: boolean;
  vendorId: string;
  error?: string;
}

export default function SettingsPage() {
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncingProduct, setSyncingProduct] = useState(false);
  const [syncingOrder, setSyncingOrder] = useState(false);
  const [productSyncResult, setProductSyncResult] = useState<SyncResult | null>(null);
  const [orderSyncResult, setOrderSyncResult] = useState<SyncResult | null>(null);
  const [lastProductSync, setLastProductSync] = useState<Date | null>(null);
  const [lastOrderSync, setLastOrderSync] = useState<Date | null>(null);
  const isConnected = healthResult?.connected ?? false;

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const data = await apiClient.get<HealthResult>(`/api/coupang-sync/health`);
      setHealthResult(data);
    } catch (err) {
      setHealthResult({ connected: false, vendorId: '', error: isApiError(err) ? err.detail : '서버 연결 실패' });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncProduct = async () => {
    setSyncingProduct(true);
    setProductSyncResult(null);
    try {
      const data = await apiClient.post<SyncResult>(`/api/coupang-sync/products`);
      setProductSyncResult(data);
      setLastProductSync(new Date());
    } catch (err) {
      setProductSyncResult({ synced: 0, errors: 1, details: [isApiError(err) ? err.detail : '서버 연결 실패'] });
    } finally {
      setSyncingProduct(false);
    }
  };

  const handleSyncOrder = async () => {
    setSyncingOrder(true);
    setOrderSyncResult(null);
    try {
      const data = await apiClient.post<SyncResult>(`/api/coupang-sync/orders`, {});
      setOrderSyncResult(data);
      setLastOrderSync(new Date());
    } catch (err) {
      setOrderSyncResult({ synced: 0, errors: 1, details: [isApiError(err) ? err.detail : '서버 연결 실패'] });
    } finally {
      setSyncingOrder(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-600" />
          설정
        </h1>
        <p className="text-sm text-slate-500 mt-1">쿠팡 API 연동, 데이터 동기화, 보고서를 관리합니다.</p>
      </div>

      <CoupangTab
        healthResult={healthResult}
        isConnected={isConnected}
        testing={testing}
        syncingProduct={syncingProduct}
        syncingOrder={syncingOrder}
        productSyncResult={productSyncResult}
        orderSyncResult={orderSyncResult}
        lastProductSync={lastProductSync}
        lastOrderSync={lastOrderSync}
        onTestConnection={handleTestConnection}
        onSyncProduct={handleSyncProduct}
        onSyncOrder={handleSyncOrder}
      />

      <AdsCsvUpload />

      <TrafficUpload />

      <ReportDownload />

      <PrinterSettings />

      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm text-blue-800">
        <strong>참고:</strong> API 호출 제한이 있으므로 동기화는 필요할 때만 실행하세요. 셀피아와 API 키를 공유하고 있어 호출 빈도가 합산됩니다.
      </div>
    </div>
  );
}
