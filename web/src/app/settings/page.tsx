'use client';

import {
  Wifi, WifiOff, RefreshCw, ExternalLink, Shield,
  Database, Globe, CreditCard, MessageSquare, Brain,
} from 'lucide-react';
import { useStore } from '@/shared/store/useStore';
import { cn, timeAgo } from '@/lib/utils';
import type { ApiProvider } from '@/shared/types';

const providerIcons: Record<ApiProvider, any> = {
  selpia: Database,
  sabangnet: Database,
  symphony: Database,
  makeshop: Globe,
  hometax: Shield,
  coupang: Globe,
  naver: Globe,
  gmarket: Globe,
  '11st': Globe,
  auction: Globe,
  openbank: CreditCard,
  aligo: MessageSquare,
  openai: Brain,
};

const providerDescriptions: Record<ApiProvider, string> = {
  selpia: '재고/주문관리 시스템 - 주문수집, 재고동기화, 송장처리',
  sabangnet: '멀티채널 상품등록/연동 - 신상품등록, 가격변경, 품절관리',
  symphony: '해피 도매 회계/재고 - 거래명세서, 재고이관, 반품처리',
  makeshop: '자사몰(메이크샵) - 주문수집, 게시판관리, 세금계산서',
  hometax: '세금계산서 발행/관리 - 전자세금계산서 자동발행',
  coupang: '쿠팡 마켓플레이스 - 주문, 정산, 아이템위너',
  naver: '네이버 스마트스토어 - 주문, 알림톡, 광고',
  gmarket: '지마켓 - 주문, 행사, 광고',
  '11st': '11번가 - 주문, 긴급공수, 행사',
  auction: '옥션 - 주문, 행사',
  openbank: '오픈뱅킹 - 은행 입출금 조회, 장부 자동기재',
  aligo: '알리고 - 문자/알림톡 발송',
  openai: 'AI 처리 - CS 자동답변, 보고서 생성, 상품페이지 제작',
};

export default function SettingsPage() {
  const { connections, updateConnection } = useStore();

  const connected = connections.filter((c) => c.isConnected);
  const disconnected = connections.filter((c) => !c.isConnected);

  return (
    <div className="space-y-6 max-w-[1000px]">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          API 연동 설정 및 시스템 구성
        </p>
      </div>

      {/* Connection Status Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-gray-500 mb-1">연결됨</p>
          <p className="text-2xl font-bold text-emerald-400">{connected.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-gray-500 mb-1">미연결</p>
          <p className="text-2xl font-bold text-gray-500">{disconnected.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-gray-500 mb-1">전체</p>
          <p className="text-2xl font-bold text-white">{connections.length}</p>
        </div>
      </div>

      {/* Connected APIs */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-400" />
          연결된 API ({connected.length})
        </h2>
        <div className="space-y-2">
          {connected.map((conn) => {
            const Icon = providerIcons[conn.provider] || Globe;
            return (
              <div key={conn.id} className="glass-card-hover p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white">{conn.name}</h3>
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {providerDescriptions[conn.provider]}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {conn.lastChecked && (
                      <p className="text-[10px] text-gray-600">
                        최종확인: {timeAgo(conn.lastChecked)}
                      </p>
                    )}
                  </div>
                  <button className="p-2 rounded-lg hover:bg-white/5 text-gray-500 transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Disconnected APIs */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-gray-500" />
          미연결 API ({disconnected.length})
        </h2>
        <div className="space-y-2">
          {disconnected.map((conn) => {
            const Icon = providerIcons[conn.provider] || Globe;
            return (
              <div key={conn.id} className="glass-card p-4 opacity-60">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-500/10 border border-gray-500/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-400">{conn.name}</h3>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {providerDescriptions[conn.provider]}
                    </p>
                  </div>
                  <button
                    onClick={() => updateConnection(conn.id, {
                      isConnected: true,
                      lastChecked: new Date().toISOString(),
                    })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    연결
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
