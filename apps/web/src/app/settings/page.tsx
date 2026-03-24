'use client';

import React, { useState } from 'react';
import { 
  RefreshCw, 
  Key, 
  Link as LinkIcon, 
  AlertCircle,
  CheckCircle2,
  Package,
  ShoppingCart
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';

export default function SettingsPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingProduct, setSyncingProduct] = useState(false);
  const [syncingOrder, setSyncingOrder] = useState(false);
  
  const [lastProductSync, setLastProductSync] = useState<Date | null>(null);
  const [lastOrderSync, setLastOrderSync] = useState<Date | null>(null);

  const handleTestConnection = () => {
    setTesting(true);
    setTimeout(() => {
      setIsConnected(true);
      setTesting(false);
    }, 1000);
  };

  const handleSyncProduct = () => {
    setSyncingProduct(true);
    setTimeout(() => {
      setLastProductSync(new Date());
      setSyncingProduct(false);
      alert('상품 동기화 완료');
    }, 2000);
  };

  const handleSyncOrder = () => {
    setSyncingOrder(true);
    setTimeout(() => {
      setLastOrderSync(new Date());
      setSyncingOrder(false);
      alert('주문 동기화 완료');
    }, 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API 연동 설정</h1>
        <p className="text-gray-500 mt-1">쿠팡 및 기타 외부 서비스 API 키를 관리합니다.</p>
      </div>

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
                "px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5",
                isConnected ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
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
                onClick={handleTestConnection}
                disabled={testing}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {testing ? '테스트 중...' : '연결 테스트'}
              </button>
            </div>
          </div>
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
              <button
                onClick={handleSyncProduct}
                disabled={syncingProduct || !isConnected}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", syncingProduct && "animate-spin")} />
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
              <button
                onClick={handleSyncOrder}
                disabled={syncingOrder || !isConnected}
                className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", syncingOrder && "animate-spin")} />
                {syncingOrder ? '동기화 중...' : '지금 동기화'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
