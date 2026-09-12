'use client';

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

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: accountSettings = null, isLoading: settingsLoading } = useQuery({
    queryKey: queryKeys.coupangAccount.settings(),
    queryFn: () =>
      apiClient.getParsed(
        '/api/channels/coupang/account',
        CoupangAccountSettingsSchema,
      ),
  });
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
      toast.success('쿠팡 Wing 계정 식별자를 저장했습니다.');
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.detail : '쿠팡 Wing 계정 식별자 저장에 실패했습니다.');
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-600" />
          설정
        </h1>
        <p className="text-sm text-slate-500 mt-1">쿠팡 Wing 계정 식별자, 브라우저 수집, 보고서를 관리합니다.</p>
      </div>

      <CoupangTab
        accountSettings={accountSettings}
        settingsLoading={settingsLoading}
        isConfigured={isConfigured}
        savingSettings={saveSettingsMutation.isPending}
        onSaveSettings={(input) => saveSettingsMutation.mutate(input)}
      />

      <AdsCsvUpload />

      <TrafficUpload />

      <ReportDownload />

      <PrinterSettings />

      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm text-blue-800">
        <strong>참고:</strong> 상품·주문 수집은 쿠팡 Wing 브라우저 세션을 사용하는 확장 프로그램 경로에서 실행합니다. 저장된 업체코드는 현재 조직의 채널 계정에만 적용됩니다.
      </div>
    </div>
  );
}
