'use client';

import { useParams } from 'next/navigation';
import {
  ShoppingCart, Calculator, Package, Headphones,
  FileText, Tag, Megaphone, ArrowLeft, Power,
  Activity, AlertTriangle, Clock, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useStore } from '@/shared/store/useStore';
import { cn, getModuleColor, formatTime, formatNumber } from '@/lib/utils';
import WorkflowList from '@/domains/workflows/components/WorkflowList';
import OrderModule from '@/domains/modules/components/OrderModule';
import AccountingModule from '@/domains/modules/components/AccountingModule';
import InventoryModule from '@/domains/modules/components/InventoryModule';
import CSModule from '@/domains/modules/components/CSModule';
import ReportModule from '@/domains/modules/components/ReportModule';
import type { ModuleCategory } from '@/shared/types';

const moduleIcons: Record<string, any> = {
  order: ShoppingCart,
  accounting: Calculator,
  inventory: Package,
  cs: Headphones,
  report: FileText,
  product: Tag,
  marketing: Megaphone,
};

const moduleDescriptions: Record<string, { title: string; details: string[] }> = {
  order: {
    title: '주문관리 자동화',
    details: [
      '셀피아/사방넷 주문 자동수집 (09:00/10:00/13:00/15:00)',
      '외부몰 주문서 다운로드 → 셀피아 자동등록',
      '송장 자동출력 및 운송장번호 각 몰 자동전송',
      '출고리스트 자동생성 → 물류팀 자동전달',
      '재고매핑 미매칭건 자동알림',
    ],
  },
  accounting: {
    title: '회계/경리 자동화',
    details: [
      '무통장입금건 감지 → 세금계산서 자동발행 (홈택스)',
      '메이크샵 세금계산서 자동발행 기능 활성화',
      '오픈뱅킹 API → 은행 입출금 자동장부 기재',
      '자금일보 매일 17:00 자동생성',
      '외상매출 자동집계 / 입금 자동매칭',
      '정산마감 자동체크',
    ],
  },
  inventory: {
    title: '재고관리 자동화',
    details: [
      '셀피아 ↔ 심포니 ↔ 사방넷 15분 간격 자동동기화',
      '재고 0 → 자동 품절처리 / 입고시 자동 해제',
      '바코드 스캔 기반 반품 자동입고',
      '전산재고 vs 실재고 불일치 자동감지/알림',
      '해피 ↔ 거영 재고이관 자동처리',
    ],
  },
  cs: {
    title: 'CS관리 자동화',
    details: [
      'AI 기반 오픈마켓 문의 자동분류/답변',
      '품절 발생시 고객 자동 문자/카톡 발송',
      '당일 미출고건 출고지연 자동안내',
      '실시간 CS 현황 대시보드',
      '반품접수 → CJ택배 회수요청 자동처리',
    ],
  },
  report: {
    title: '보고서 자동생성',
    details: [
      '일매출 보고서 매일 18:00 자동생성/전달',
      '월말보고서 (방문자수/구매수/매출) 자동생성',
      '쿠팡 광고보조서 주간/월간 자동생성',
      '쿠팡윙 순익보고서 자동생성',
      '실시간 매출 대시보드',
    ],
  },
  product: {
    title: '상품관리 자동화',
    details: [
      '사방넷 1회 입력 → 전 몰 자동등록',
      'AI 상세페이지 초안 자동생성',
      '행사가격 변경 → 전 몰 자동반영',
      '시즌/트렌드 기반 기획전 제안서 AI 자동생성',
      '비노출/품절 상품 자동감지 알림',
    ],
  },
  marketing: {
    title: '마케팅 자동화',
    details: [
      'SNS 주간 콘텐츠 일괄 예약 업로드',
      'AI 상품별 SNS 카피/해시태그 자동생성',
      '스케줄 기반 알림톡 자동발송',
      '네이버/쿠팡 광고 성과 기반 자동 최적화',
      '쿠팡 아이템위너 이탈 자동감지 → 알림',
    ],
  },
};

export default function ModuleDetailPage() {
  const params = useParams();
  const moduleId = params.moduleId as ModuleCategory;
  const { modules, getWorkflowsByModule, toggleModule } = useStore();
  const moduleData = modules.find((m) => m.id === moduleId);
  const workflows = getWorkflowsByModule(moduleId);
  const Icon = moduleIcons[moduleId] || Zap;
  const color = getModuleColor(moduleId);
  const desc = moduleDescriptions[moduleId];

  if (!moduleData) {
    return <div className="text-gray-500">모듈을 찾을 수 없습니다.</div>;
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        대시보드로 돌아가기
      </Link>

      {/* Module Header */}
      <div className="glass-card p-6 relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: color }}
        />
        <div className="relative flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
            >
              <Icon className="w-7 h-7" style={{ color }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{desc?.title || moduleData.nameKo}</h1>
              <p className="text-sm text-gray-500 mt-1">{moduleData.description}</p>
            </div>
          </div>
          <button
            onClick={() => toggleModule(moduleId)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              moduleData.isActive
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                : 'bg-gray-500/10 text-gray-400 border border-gray-500/20 hover:bg-gray-500/20'
            )}
          >
            <Power className="w-4 h-4" />
            {moduleData.isActive ? '활성화됨' : '비활성화됨'}
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-black/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] text-gray-500">워크플로우</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {moduleData.activeWorkflows}<span className="text-sm text-gray-600">/{moduleData.totalWorkflows}</span>
            </p>
          </div>
          <div className="bg-black/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] text-gray-500">오늘 실행</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">
              {formatNumber(moduleData.todayExecutions)}
            </p>
          </div>
          <div className="bg-black/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-[10px] text-gray-500">오류</span>
            </div>
            <p className={cn(
              'text-2xl font-bold',
              moduleData.todayErrors > 0 ? 'text-red-400' : 'text-gray-600'
            )}>
              {moduleData.todayErrors}
            </p>
          </div>
          <div className="bg-black/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-violet-400" />
              <span className="text-[10px] text-gray-500">절감 시간</span>
            </div>
            <p className="text-2xl font-bold text-violet-400">
              {formatTime(moduleData.savedMinutes)}
            </p>
          </div>
        </div>
      </div>

      {/* Module-specific Detail Content */}
      {moduleId === 'order' && <OrderModule />}
      {moduleId === 'accounting' && <AccountingModule />}
      {moduleId === 'inventory' && <InventoryModule />}
      {moduleId === 'cs' && <CSModule />}
      {moduleId === 'report' && <ReportModule />}

      {/* Automation Details (for modules without specific UI) */}
      {!['order', 'accounting', 'inventory', 'cs', 'report'].includes(moduleId) && desc && (
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white mb-3">자동화 항목</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {desc.details.map((detail, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-black/20"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-gray-400 leading-relaxed">{detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflows */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">워크플로우</h2>
        {workflows.length > 0 ? (
          <WorkflowList workflows={workflows} showModule={false} />
        ) : (
          <div className="glass-card p-8 text-center">
            <p className="text-gray-600 text-sm">아직 등록된 워크플로우가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
