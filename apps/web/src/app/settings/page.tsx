'use client';

import React, { useState } from 'react';
import {
  Link as LinkIcon,
  Settings,
  Building2,
  ListChecks,
  Shield,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import CompanyInfoTab from './components/CompanyInfoTab';
import CoupangTab from './components/CoupangTab';
import CommonCodesTab from './components/CommonCodesTab';
import RulesConfigTab from './components/RulesConfigTab';

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

export interface CompanyInfo {
  id: string;
  name: string;
  businessNumber: string | null;
  representative: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

type SettingsTab = 'company' | 'coupang' | 'codes' | 'rules';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncingProduct, setSyncingProduct] = useState(false);
  const [syncingOrder, setSyncingOrder] = useState(false);
  const [productSyncResult, setProductSyncResult] = useState<SyncResult | null>(null);
  const [orderSyncResult, setOrderSyncResult] = useState<SyncResult | null>(null);
  const [lastProductSync, setLastProductSync] = useState<Date | null>(null);
  const [lastOrderSync, setLastOrderSync] = useState<Date | null>(null);
  const isConnected = healthResult?.connected ?? false;

  const { data: companyInfo = null, isLoading: companyLoading } = useQuery({
    queryKey: queryKeys.companies.list(),
    queryFn: async () => {
      const data = await apiClient.get<CompanyInfo[] | { items: CompanyInfo[] }>(`/api/companies`);
      const items = Array.isArray(data) ? data : data.items ?? [];
      return items.length > 0 ? items[0] : null;
    },
    enabled: activeTab === 'company',
  });

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

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { key: 'company', label: '회사 정보', icon: <Building2 className="w-4 h-4" /> },
    { key: 'coupang', label: '쿠팡 연동', icon: <LinkIcon className="w-4 h-4" /> },
    { key: 'codes', label: '공통 코드', icon: <ListChecks className="w-4 h-4" /> },
    { key: 'rules', label: '규칙 설정', icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-gray-600" />
          설정
        </h1>
        <p className="text-gray-500 mt-1">회사 정보, API 연동, 공통 코드를 관리합니다.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'company' && (
        <CompanyInfoTab
          companyInfo={companyInfo}
          loading={companyLoading}
        />
      )}

      {activeTab === 'coupang' && (
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
      )}

      {activeTab === 'codes' && <CommonCodesTab />}
      {activeTab === 'rules' && <RulesConfigTab />}
    </div>
  );
}
