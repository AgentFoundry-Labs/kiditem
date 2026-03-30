'use client';

import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Key,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle2,
  Package,
  ShoppingCart,
  Settings,
  Building2,
  ListChecks,
  Shield,
  Save,
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

interface SyncResult {
  synced: number;
  errors: number;
  details?: string[];
}

interface HealthResult {
  connected: boolean;
  vendorId: string;
  error?: string;
}

interface CompanyInfo {
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
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);

  const isConnected = healthResult?.connected ?? false;

  useEffect(() => {
    if (activeTab === 'company') {
      setCompanyLoading(true);
      fetch(`${API_BASE}/api/companies`)
        .then((r) => r.json())
        .then((data) => {
          const items = Array.isArray(data) ? data : data.items ?? [];
          if (items.length > 0) setCompanyInfo(items[0]);
        })
        .catch(() => {})
        .finally(() => setCompanyLoading(false));
    }
  }, [activeTab]);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${API_BASE}/api/coupang-sync/health`);
      const data: HealthResult = await res.json();
      setHealthResult(data);
    } catch {
      setHealthResult({ connected: false, vendorId: '', error: '서버 연결 실패' });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncProduct = async () => {
    setSyncingProduct(true);
    setProductSyncResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/coupang-sync/products`, {
        method: 'POST',
      });
      const data: SyncResult = await res.json();
      setProductSyncResult(data);
      setLastProductSync(new Date());
    } catch {
      setProductSyncResult({ synced: 0, errors: 1, details: ['서버 연결 실패'] });
    } finally {
      setSyncingProduct(false);
    }
  };

  const handleSyncOrder = async () => {
    setSyncingOrder(true);
    setOrderSyncResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/coupang-sync/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data: SyncResult = await res.json();
      setOrderSyncResult(data);
      setLastOrderSync(new Date());
    } catch {
      setOrderSyncResult({ synced: 0, errors: 1, details: ['서버 연결 실패'] });
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
        <CompanyInfoSection
          companyInfo={companyInfo}
          loading={companyLoading}
        />
      )}

      {activeTab === 'coupang' && (
        <CoupangIntegrationSection
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

      {activeTab === 'codes' && <CommonCodesSection />}
      {activeTab === 'rules' && <RulesConfigSection />}
    </div>
  );
}

function CompanyInfoSection({
  companyInfo,
  loading,
}: {
  companyInfo: CompanyInfo | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        로딩 중...
      </div>
    );
  }

  const fields: { label: string; value: string | null | undefined }[] = [
    { label: '회사명', value: companyInfo?.name },
    { label: '사업자번호', value: companyInfo?.businessNumber },
    { label: '대표자', value: companyInfo?.representative },
    { label: '주소', value: companyInfo?.address },
    { label: '전화번호', value: companyInfo?.phone },
    { label: '이메일', value: companyInfo?.email },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Building2 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">회사 정보</h2>
            <p className="text-sm text-gray-500">등록된 회사 기본 정보입니다.</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        {!companyInfo ? (
          <div className="text-center py-8 text-gray-500">
            <Building2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">등록된 회사 정보가 없습니다.</p>
            <p className="text-xs text-gray-400 mt-1">
              백엔드 API에서 회사 정보를 등록해주세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((field) => (
              <div key={field.label}>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  {field.label}
                </label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900">
                  {field.value || '-'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CoupangIntegrationSection({
  healthResult,
  isConnected,
  testing,
  syncingProduct,
  syncingOrder,
  productSyncResult,
  orderSyncResult,
  lastProductSync,
  lastOrderSync,
  onTestConnection,
  onSyncProduct,
  onSyncOrder,
}: {
  healthResult: HealthResult | null;
  isConnected: boolean;
  testing: boolean;
  syncingProduct: boolean;
  syncingOrder: boolean;
  productSyncResult: SyncResult | null;
  orderSyncResult: SyncResult | null;
  lastProductSync: Date | null;
  lastOrderSync: Date | null;
  onTestConnection: () => void;
  onSyncProduct: () => void;
  onSyncOrder: () => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <LinkIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">쿠팡 마켓플레이스 연동</h2>
              <p className="text-sm text-gray-500">쿠팡 스토어의 상품 및 주문을 동기화합니다.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5',
              isConnected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
            )}>
              {isConnected ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> 연결됨
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" /> 미연결
                </>
              )}
            </div>
            <button
              onClick={onTestConnection}
              disabled={testing}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {testing ? '테스트 중...' : '연결 테스트'}
            </button>
          </div>
        </div>
        {healthResult && !healthResult.connected && healthResult.error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {healthResult.error}
          </div>
        )}
        {healthResult?.connected && healthResult.vendorId && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            Vendor ID: {healthResult.vendorId}
          </div>
        )}
      </div>

      <div className="p-6 border-b border-gray-200 bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Key className="w-4 h-4 text-gray-500" /> API 키 설정
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Access Key</label>
            <input
              type="text"
              value="************************"
              disabled
              className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-md text-gray-500 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
            <input
              type="password"
              value="****************************************"
              disabled
              className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-md text-gray-500 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor ID</label>
            <input
              type="text"
              value="A00******"
              disabled
              className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-md text-gray-500 font-mono text-sm"
            />
          </div>
        </div>
      </div>

      <div className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">데이터 동기화</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Package className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">상품 동기화</h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  {lastProductSync ? `마지막 동기화: ${timeAgo(lastProductSync.toISOString())}` : '동기화 기록 없음'}
                </p>
              </div>
            </div>
            {productSyncResult && (
              <div className={cn(
                'mb-3 p-2 rounded text-xs',
                productSyncResult.errors > 0
                  ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                  : 'bg-green-50 text-green-800 border border-green-200'
              )}>
                동기화 {productSyncResult.synced}건 완료
                {productSyncResult.errors > 0 && `, 오류 ${productSyncResult.errors}건`}
              </div>
            )}
            <button
              onClick={onSyncProduct}
              disabled={syncingProduct || !isConnected}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', syncingProduct && 'animate-spin')} />
              {syncingProduct ? '동기화 중...' : '지금 동기화'}
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">주문 동기화</h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  {lastOrderSync ? `마지막 동기화: ${timeAgo(lastOrderSync.toISOString())}` : '동기화 기록 없음'}
                </p>
              </div>
            </div>
            {orderSyncResult && (
              <div className={cn(
                'mb-3 p-2 rounded text-xs',
                orderSyncResult.errors > 0
                  ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                  : 'bg-green-50 text-green-800 border border-green-200'
              )}>
                동기화 {orderSyncResult.synced}건 완료
                {orderSyncResult.errors > 0 && `, 오류 ${orderSyncResult.errors}건`}
              </div>
            )}
            <button
              onClick={onSyncOrder}
              disabled={syncingOrder || !isConnected}
              className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', syncingOrder && 'animate-spin')} />
              {syncingOrder ? '동기화 중...' : '지금 동기화'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const COMMON_CODES = [
  {
    group: '상품 상태',
    codes: [
      { code: 'draft', label: '초안', description: '소싱 후 미가공 상태' },
      { code: 'processing', label: '가공중', description: 'AI 콘텐츠 생성 진행중' },
      { code: 'processed', label: '가공완료', description: '콘텐츠 생성 완료, 리스팅 대기' },
      { code: 'active', label: '판매중', description: '마켓플레이스 등록 완료' },
      { code: 'inactive', label: '판매중지', description: '일시 판매 중지' },
    ],
  },
  {
    group: '상품 등급',
    codes: [
      { code: 'A', label: 'A등급', description: '핵심상품 (매출 상위)' },
      { code: 'B', label: 'B등급', description: '일반상품' },
      { code: 'C', label: 'C등급', description: '저성과 상품' },
      { code: 'D', label: 'D등급', description: '정리 대상' },
    ],
  },
  {
    group: '주문 상태',
    codes: [
      { code: 'ACCEPT', label: '발주확인', description: '주문 접수 완료' },
      { code: 'INSTRUCT', label: '배송지시', description: '출고 지시 완료' },
      { code: 'DEPARTURE', label: '출고완료', description: '택배사 인수' },
      { code: 'DELIVERING', label: '배송중', description: '배송 진행중' },
      { code: 'FINAL_DELIVERY', label: '배송완료', description: '수취인 수령' },
      { code: 'CANCEL', label: '취소', description: '주문 취소' },
      { code: 'RETURN', label: '반품', description: '반품 접수' },
    ],
  },
];

interface BusinessRule {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  category: string;
  severity: string;
  field: string;
  operator: string;
  threshold: Record<string, number>;
  messageTemplate: string;
  actionType: string | null;
  autoExecute: boolean;
  active: boolean;
  sortOrder: number;
}

const RULE_CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'profitability', label: '수익성' },
  { key: 'advertising', label: '광고' },
  { key: 'inventory', label: '재고' },
  { key: 'feedback', label: '피드백' },
  { key: 'order', label: '주문' },
];

const SEVERITY_BADGE: Record<string, { label: string; cls: string }> = {
  critical: { label: '위험', cls: 'bg-red-100 text-red-700' },
  warning: { label: '주의', cls: 'bg-amber-100 text-amber-700' },
  info: { label: '정보', cls: 'bg-blue-100 text-blue-700' },
};

interface RuleChange {
  active?: boolean;
  autoExecute?: boolean;
  threshold?: Record<string, number>;
}

interface ScheduleOption {
  key: string;
  label: string;
  crons: string[];
}

function RulesConfigSection() {
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [changes, setChanges] = useState<Record<string, RuleChange>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [schedule, setSchedule] = useState('twice_daily');
  const [scheduleOptions, setScheduleOptions] = useState<ScheduleOption[]>([]);
  const [scheduleUpdating, setScheduleUpdating] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, { currentThreshold: number | null; suggestedThreshold: number; ruleId: string }>>({});
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/rules`)
      .then((r) => r.json())
      .then((data: unknown) => setRules(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/api/rules/schedule`)
      .then((r) => r.json())
      .then((data: { schedule: string; options: ScheduleOption[] }) => {
        setSchedule(data.schedule);
        setScheduleOptions(data.options);
      })
      .catch(() => {});
  }, []);

  const handleScheduleChange = async (newSchedule: string) => {
    setScheduleUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/api/rules/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: newSchedule }),
      });
      if (res.ok) {
        setSchedule(newSchedule);
      }
    } catch { /* ignore */ }
    setScheduleUpdating(false);
  };

  const handleLoadSuggestions = async () => {
    setSuggestionsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/rules/suggest-thresholds`);
      if (res.ok) {
        const data = await res.json();
        const map: typeof suggestions = {};
        for (const s of data.suggestions ?? []) {
          map[s.ruleId] = { currentThreshold: s.currentThreshold, suggestedThreshold: s.suggestedThreshold, ruleId: s.ruleId };
        }
        setSuggestions(map);
      }
    } catch { /* ignore */ }
    setSuggestionsLoading(false);
  };

  const handleApplySuggestion = (ruleId: string, suggested: number) => {
    setChanges((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], threshold: { value: suggested } },
    }));
  };

  const filteredRules = categoryFilter === 'all'
    ? rules
    : rules.filter((r) => r.category === categoryFilter);

  const isRuleActive = (rule: BusinessRule): boolean => {
    const c = changes[rule.id];
    return c?.active !== undefined ? c.active : rule.active;
  };

  const isRuleAutoExecute = (rule: BusinessRule): boolean => {
    const c = changes[rule.id];
    return c?.autoExecute !== undefined ? c.autoExecute : rule.autoExecute;
  };

  const getRuleThreshold = (rule: BusinessRule): Record<string, number> => {
    const c = changes[rule.id];
    return c?.threshold ?? rule.threshold;
  };

  const updateChange = (ruleId: string, patch: RuleChange) => {
    setChanges((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], ...patch },
    }));
  };

  const updateThreshold = (ruleId: string, key: string, val: number) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;
    const current = getRuleThreshold(rule);
    updateChange(ruleId, { threshold: { ...current, [key]: val } });
  };

  const hasChanges = Object.keys(changes).length > 0;

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      for (const [id, patch] of Object.entries(changes)) {
        await fetch(`${API_BASE}/api/rules/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      }
      await fetch(`${API_BASE}/api/rules/reload`, { method: 'POST' });
      const res = await fetch(`${API_BASE}/api/rules`);
      const data: unknown = await res.json();
      setRules(Array.isArray(data) ? data : []);
      setChanges({});
      setSaveMsg({ text: '저장 완료', type: 'success' });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveMsg({ text: '저장 실패', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-48 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scheduleOptions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">자동 평가 스케줄</h4>
              <p className="text-xs text-gray-500 mt-0.5">설정된 간격으로 전체 상품을 자동 평가합니다</p>
            </div>
            <select
              value={schedule}
              onChange={(e) => handleScheduleChange(e.target.value)}
              disabled={scheduleUpdating}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 disabled:opacity-50"
            >
              {scheduleOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {RULE_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(cat.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                categoryFilter === cat.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span className={cn(
              'text-xs font-medium',
              saveMsg.type === 'success' ? 'text-green-600' : 'text-red-600'
            )}>
              {saveMsg.text}
            </span>
          )}
          <button
            onClick={handleLoadSuggestions}
            disabled={suggestionsLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {suggestionsLoading ? '분석 중...' : '추천 임계값'}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              hasChanges
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            )}
          >
            <Save className="w-4 h-4" />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {filteredRules.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          <Shield className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">규칙이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRules.map((rule) => {
            const active = isRuleActive(rule);
            const autoExec = isRuleAutoExecute(rule);
            const threshold = getRuleThreshold(rule);
            const sev = SEVERITY_BADGE[rule.severity] || SEVERITY_BADGE.info;

            return (
              <div
                key={rule.id}
                className={cn(
                  'bg-white rounded-lg border border-gray-200 p-4 transition-opacity',
                  !active && 'opacity-50'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', sev.cls)}>
                        {sev.label}
                      </span>
                      <h4 className="text-sm font-semibold text-gray-900">{rule.displayName}</h4>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-gray-500 mb-2">{rule.description}</p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-gray-400">
                        필드: <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">{rule.field}</code>
                      </span>
                      <span className="text-xs text-gray-400">조건: {rule.operator}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">임계값:</span>
                        {threshold.value !== undefined ? (
                          <input
                            type="number"
                            value={threshold.value}
                            onChange={(e) => updateThreshold(rule.id, 'value', Number(e.target.value))}
                            className="w-16 text-center border-b border-gray-300 text-xs py-0.5 bg-transparent focus:border-blue-500 focus:outline-none"
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={threshold.min ?? 0}
                              onChange={(e) => updateThreshold(rule.id, 'min', Number(e.target.value))}
                              className="w-14 text-center border-b border-gray-300 text-xs py-0.5 bg-transparent focus:border-blue-500 focus:outline-none"
                            />
                            <span className="text-xs text-gray-400">~</span>
                            <input
                              type="number"
                              value={threshold.max ?? 0}
                              onChange={(e) => updateThreshold(rule.id, 'max', Number(e.target.value))}
                              className="w-14 text-center border-b border-gray-300 text-xs py-0.5 bg-transparent focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                        )}
                        {suggestions[rule.id] && suggestions[rule.id].suggestedThreshold !== suggestions[rule.id].currentThreshold && (
                          <button
                            onClick={() => handleApplySuggestion(rule.id, suggestions[rule.id].suggestedThreshold)}
                            className="px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                          >
                            추천: {suggestions[rule.id].suggestedThreshold}
                          </button>
                        )}
                      </div>
                    </div>
                    {rule.actionType && (
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-400">액션: {rule.actionType}</span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <span className="text-xs text-gray-500">자동실행</span>
                          <button
                            type="button"
                            onClick={() => updateChange(rule.id, { autoExecute: !autoExec })}
                            className={cn(
                              'relative w-9 h-5 rounded-full transition-colors',
                              autoExec ? 'bg-blue-600' : 'bg-gray-300'
                            )}
                          >
                            <span className={cn(
                              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                              autoExec && 'translate-x-4'
                            )} />
                          </button>
                        </label>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateChange(rule.id, { active: !active })}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors shrink-0',
                      active ? 'bg-green-500' : 'bg-gray-300'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                      active && 'translate-x-5'
                    )} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommonCodesSection() {
  return (
    <div className="space-y-4">
      {COMMON_CODES.map((group) => (
        <div
          key={group.group}
          className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b border-gray-200 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-gray-900">{group.group}</h3>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="bg-gray-50">
                  <th>코드</th>
                  <th>라벨</th>
                  <th>설명</th>
                </tr>
              </thead>
              <tbody>
                {group.codes.map((code) => (
                  <tr key={code.code}>
                    <td>
                      <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-700">
                        {code.code}
                      </code>
                    </td>
                    <td className="font-medium text-gray-900">{code.label}</td>
                    <td className="text-gray-500 text-sm">{code.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
