'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  CoupangAccountSettingsSchema,
  type CoupangAccountSettings,
  type UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
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
  const queryClient = useQueryClient();
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null);
  const [productSyncResult, setProductSyncResult] = useState<SyncResult | null>(null);
  const [orderSyncResult, setOrderSyncResult] = useState<SyncResult | null>(null);
  const [lastProductSync, setLastProductSync] = useState<Date | null>(null);
  const [lastOrderSync, setLastOrderSync] = useState<Date | null>(null);
  const { data: accountSettings = null, isLoading: settingsLoading } = useQuery({
    queryKey: queryKeys.coupangAccount.settings(),
    queryFn: () =>
      apiClient.getParsed(
        '/api/channels/coupang/account',
        CoupangAccountSettingsSchema,
      ),
  });
  const isConnected = healthResult?.connected ?? false;
  const isConfigured = accountSettings?.configured ?? false;

  const saveSettingsMutation = useMutation({
    mutationFn: (input: UpdateCoupangAccountSettings) =>
      apiClient.patchParsed<CoupangAccountSettings>(
        '/api/channels/coupang/account',
        CoupangAccountSettingsSchema,
        input,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.coupangAccount.settings(), data);
      setHealthResult(null);
      toast.success('쿠팡 API 설정을 저장했습니다.');
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.detail : '쿠팡 API 설정 저장에 실패했습니다.');
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: () => apiClient.get<HealthResult>('/api/coupang-sync/health'),
    onSuccess: (data) => {
      setHealthResult(data);
      if (data.connected) toast.success('쿠팡 API 연결을 확인했습니다.');
      else toast.error(data.error || '쿠팡 API 연결에 실패했습니다.');
    },
    onError: (err) => {
      const error = isApiError(err) ? err.detail : '서버 연결 실패';
      setHealthResult({ connected: false, vendorId: '', error });
      toast.error(error);
    },
  });

  const syncProductMutation = useMutation({
    mutationFn: () => apiClient.post<SyncResult>('/api/coupang-sync/products'),
    onMutate: () => setProductSyncResult(null),
    onSuccess: (data) => {
      setProductSyncResult(data);
      setLastProductSync(new Date());
    },
    onError: (err) => {
      setProductSyncResult({ synced: 0, errors: 1, details: [isApiError(err) ? err.detail : '서버 연결 실패'] });
    },
  });

  const syncOrderMutation = useMutation({
    mutationFn: () => apiClient.post<SyncResult>('/api/coupang-sync/orders', {}),
    onMutate: () => setOrderSyncResult(null),
    onSuccess: (data) => {
      setOrderSyncResult(data);
      setLastOrderSync(new Date());
    },
    onError: (err) => {
      setOrderSyncResult({ synced: 0, errors: 1, details: [isApiError(err) ? err.detail : '서버 연결 실패'] });
    },
  });

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
        accountSettings={accountSettings}
        settingsLoading={settingsLoading}
        healthResult={healthResult}
        isConnected={isConnected}
        isConfigured={isConfigured}
        testing={testConnectionMutation.isPending}
        savingSettings={saveSettingsMutation.isPending}
        syncingProduct={syncProductMutation.isPending}
        syncingOrder={syncOrderMutation.isPending}
        productSyncResult={productSyncResult}
        orderSyncResult={orderSyncResult}
        lastProductSync={lastProductSync}
        lastOrderSync={lastOrderSync}
        onSaveSettings={(input) => saveSettingsMutation.mutate(input)}
        onTestConnection={() => testConnectionMutation.mutate()}
        onSyncProduct={() => syncProductMutation.mutate()}
        onSyncOrder={() => syncOrderMutation.mutate()}
      />

      <AdsCsvUpload />

      <TrafficUpload />

      <ReportDownload />

      <PrinterSettings />

      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm text-blue-800">
        <strong>참고:</strong> API 호출 제한이 있으므로 동기화는 필요할 때만 실행하세요. 저장된 쿠팡 API 설정은 현재 조직의 채널 계정에만 적용됩니다.
      </div>
    </div>
  );
}
