import { create } from 'zustand';
import type {
  Workflow,
  ModuleStatus,
  ExecutionLog,
  ApiConnection,
  ModuleCategory,
  DashboardStats,
} from '@/types';

// ============================================
// Mock Data - 실제 운영 데이터 기반
// ============================================

const mockModules: ModuleStatus[] = [
  {
    id: 'order',
    name: 'Order Management',
    nameKo: '주문관리',
    description: '주문수집, 송장출력, 운송장전송, 출고리스트 자동화',
    isActive: true,
    activeWorkflows: 4,
    totalWorkflows: 6,
    lastRun: new Date(Date.now() - 300000).toISOString(),
    todayExecutions: 48,
    todayErrors: 1,
    savedMinutes: 145,
  },
  {
    id: 'accounting',
    name: 'Accounting',
    nameKo: '회계/경리',
    description: '세금계산서, 자금일보, 외상매출, 입금매칭 자동화',
    isActive: true,
    activeWorkflows: 5,
    totalWorkflows: 7,
    lastRun: new Date(Date.now() - 600000).toISOString(),
    todayExecutions: 23,
    todayErrors: 0,
    savedMinutes: 180,
  },
  {
    id: 'inventory',
    name: 'Inventory',
    nameKo: '재고관리',
    description: '재고동기화, 품절관리, 반품입고, 재고이관 자동화',
    isActive: true,
    activeWorkflows: 3,
    totalWorkflows: 5,
    lastRun: new Date(Date.now() - 900000).toISOString(),
    todayExecutions: 96,
    todayErrors: 2,
    savedMinutes: 60,
  },
  {
    id: 'cs',
    name: 'Customer Service',
    nameKo: 'CS관리',
    description: '자동답변, 품절안내, 출고지연알림, 반품접수 자동화',
    isActive: true,
    activeWorkflows: 3,
    totalWorkflows: 5,
    lastRun: new Date(Date.now() - 180000).toISOString(),
    todayExecutions: 34,
    todayErrors: 0,
    savedMinutes: 90,
  },
  {
    id: 'report',
    name: 'Reports',
    nameKo: '보고서',
    description: '일매출, 월말보고서, 광고보조서, 순익보고서 자동생성',
    isActive: true,
    activeWorkflows: 3,
    totalWorkflows: 4,
    lastRun: new Date(Date.now() - 3600000).toISOString(),
    todayExecutions: 5,
    todayErrors: 0,
    savedMinutes: 120,
  },
  {
    id: 'product',
    name: 'Product Management',
    nameKo: '상품관리',
    description: '신상품등록, 가격변경, 상품노출관리 자동화',
    isActive: false,
    activeWorkflows: 0,
    totalWorkflows: 4,
    lastRun: undefined,
    todayExecutions: 0,
    todayErrors: 0,
    savedMinutes: 0,
  },
  {
    id: 'marketing',
    name: 'Marketing',
    nameKo: '마케팅',
    description: 'SNS예약, 알림톡발송, 광고최적화, 아이템위너 모니터링',
    isActive: false,
    activeWorkflows: 0,
    totalWorkflows: 5,
    lastRun: undefined,
    todayExecutions: 0,
    todayErrors: 0,
    savedMinutes: 0,
  },
];

const mockWorkflows: Workflow[] = [
  {
    id: 'wf-order-collect',
    name: '주문 자동수집',
    description: '셀피아/사방넷에서 오픈마켓+자사몰 주문을 자동 수집하고 송장출력',
    module: 'order',
    nodes: [
      { id: 'n1', type: 'trigger', label: '스케줄 트리거', module: 'order', config: { cron: '0 9,10,13,15 * * 1-5' }, position: { x: 100, y: 200 }, status: 'success' },
      { id: 'n2', type: 'api_call', label: '셀피아 주문수집', module: 'order', config: { api: 'selpia', endpoint: '/orders/collect' }, position: { x: 350, y: 100 }, status: 'success' },
      { id: 'n3', type: 'api_call', label: '사방넷 주문수집', module: 'order', config: { api: 'sabangnet', endpoint: '/orders/collect' }, position: { x: 350, y: 300 }, status: 'success' },
      { id: 'n4', type: 'data_transform', label: '주문 통합/정리', module: 'order', config: { merge: true }, position: { x: 600, y: 200 }, status: 'success' },
      { id: 'n5', type: 'condition', label: '재고 확인', module: 'order', config: { check: 'inventory' }, position: { x: 850, y: 200 }, status: 'success' },
      { id: 'n6', type: 'action', label: '송장 출력', module: 'order', config: { action: 'print_invoice' }, position: { x: 1100, y: 100 }, status: 'idle' },
      { id: 'n7', type: 'notification', label: '미매칭 알림', module: 'order', config: { channel: 'slack' }, position: { x: 1100, y: 300 }, status: 'idle' },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n1', target: 'n3' },
      { id: 'e3', source: 'n2', target: 'n4' },
      { id: 'e4', source: 'n3', target: 'n4' },
      { id: 'e5', source: 'n4', target: 'n5' },
      { id: 'e6', source: 'n5', target: 'n6', label: '재고있음' },
      { id: 'e7', source: 'n5', target: 'n7', label: '재고없음' },
    ],
    isActive: true,
    schedule: '0 9,10,13,15 * * 1-5',
    lastRun: new Date(Date.now() - 300000).toISOString(),
    lastStatus: 'success',
    createdAt: '2026-03-01T09:00:00Z',
    updatedAt: '2026-03-18T09:00:00Z',
  },
  {
    id: 'wf-tracking-sync',
    name: '운송장 자동전송',
    description: '셀피아에서 각 오픈마켓으로 운송장번호 자동전송',
    module: 'order',
    nodes: [
      { id: 'n1', type: 'trigger', label: '출고완료 이벤트', module: 'order', config: { event: 'shipment_complete' }, position: { x: 100, y: 200 }, status: 'success' },
      { id: 'n2', type: 'api_call', label: '운송장번호 조회', module: 'order', config: { api: 'selpia' }, position: { x: 350, y: 200 }, status: 'success' },
      { id: 'n3', type: 'action', label: '오픈마켓 전송', module: 'order', config: { targets: ['naver', 'coupang', 'gmarket'] }, position: { x: 600, y: 200 }, status: 'success' },
      { id: 'n4', type: 'action', label: '외부몰 수동입력 대상 알림', module: 'order', config: { targets: ['haebub', 'boribori'] }, position: { x: 850, y: 200 }, status: 'idle' },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
    isActive: true,
    lastRun: new Date(Date.now() - 600000).toISOString(),
    lastStatus: 'success',
    createdAt: '2026-03-01T09:00:00Z',
    updatedAt: '2026-03-18T09:00:00Z',
  },
  {
    id: 'wf-tax-invoice',
    name: '세금계산서 자동발행',
    description: '무통장입금건 감지 → 홈택스 세금계산서 자동발행',
    module: 'accounting',
    nodes: [
      { id: 'n1', type: 'trigger', label: '입금감지 트리거', module: 'accounting', config: { event: 'payment_received' }, position: { x: 100, y: 200 }, status: 'success' },
      { id: 'n2', type: 'condition', label: '세금계산서 필요?', module: 'accounting', config: {}, position: { x: 350, y: 200 }, status: 'success' },
      { id: 'n3', type: 'api_call', label: '홈택스 발행', module: 'accounting', config: { api: 'hometax' }, position: { x: 600, y: 100 }, status: 'success' },
      { id: 'n4', type: 'notification', label: '발행완료 알림', module: 'accounting', config: {}, position: { x: 850, y: 200 }, status: 'idle' },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', label: '필요' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
    isActive: true,
    lastRun: new Date(Date.now() - 1800000).toISOString(),
    lastStatus: 'success',
    createdAt: '2026-03-05T09:00:00Z',
    updatedAt: '2026-03-18T09:00:00Z',
  },
  {
    id: 'wf-daily-report',
    name: '일매출 자동보고서',
    description: '매일 18:00 각 몰 매출 자동집계 → 보고서 생성 → 전달',
    module: 'report',
    nodes: [
      { id: 'n1', type: 'trigger', label: '18:00 스케줄', module: 'report', config: { cron: '0 18 * * 1-5' }, position: { x: 100, y: 200 }, status: 'success' },
      { id: 'n2', type: 'api_call', label: '각 몰 매출 수집', module: 'report', config: {}, position: { x: 350, y: 200 }, status: 'success' },
      { id: 'n3', type: 'ai_process', label: 'AI 보고서 생성', module: 'report', config: { model: 'gpt-4' }, position: { x: 600, y: 200 }, status: 'success' },
      { id: 'n4', type: 'notification', label: '카톡/이메일 전달', module: 'report', config: {}, position: { x: 850, y: 200 }, status: 'idle' },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
    isActive: true,
    schedule: '0 18 * * 1-5',
    lastRun: new Date(Date.now() - 7200000).toISOString(),
    lastStatus: 'success',
    createdAt: '2026-03-01T09:00:00Z',
    updatedAt: '2026-03-18T09:00:00Z',
  },
  {
    id: 'wf-inventory-sync',
    name: '재고 실시간 동기화',
    description: '셀피아 ↔ 심포니 ↔ 사방넷 재고 15분 간격 동기화',
    module: 'inventory',
    nodes: [
      { id: 'n1', type: 'trigger', label: '15분 스케줄', module: 'inventory', config: { cron: '*/15 * * * *' }, position: { x: 100, y: 200 }, status: 'success' },
      { id: 'n2', type: 'api_call', label: '셀피아 재고 조회', module: 'inventory', config: { api: 'selpia' }, position: { x: 350, y: 100 }, status: 'success' },
      { id: 'n3', type: 'api_call', label: '심포니 재고 조회', module: 'inventory', config: { api: 'symphony' }, position: { x: 350, y: 300 }, status: 'success' },
      { id: 'n4', type: 'data_transform', label: '재고 비교/매칭', module: 'inventory', config: {}, position: { x: 600, y: 200 }, status: 'success' },
      { id: 'n5', type: 'condition', label: '불일치 체크', module: 'inventory', config: {}, position: { x: 850, y: 200 }, status: 'idle' },
      { id: 'n6', type: 'action', label: '자동 동기화', module: 'inventory', config: {}, position: { x: 1100, y: 100 }, status: 'idle' },
      { id: 'n7', type: 'notification', label: '불일치 알림', module: 'inventory', config: {}, position: { x: 1100, y: 300 }, status: 'idle' },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n1', target: 'n3' },
      { id: 'e3', source: 'n2', target: 'n4' },
      { id: 'e4', source: 'n3', target: 'n4' },
      { id: 'e5', source: 'n4', target: 'n5' },
      { id: 'e6', source: 'n5', target: 'n6', label: '자동조정 가능' },
      { id: 'e7', source: 'n5', target: 'n7', label: '수동 확인 필요' },
    ],
    isActive: true,
    schedule: '*/15 * * * *',
    lastRun: new Date(Date.now() - 120000).toISOString(),
    lastStatus: 'success',
    createdAt: '2026-03-01T09:00:00Z',
    updatedAt: '2026-03-18T09:00:00Z',
  },
  {
    id: 'wf-cs-auto-reply',
    name: 'CS 자동답변',
    description: '오픈마켓 게시판 문의 자동 감지 → AI 답변 생성 → 자동 등록',
    module: 'cs',
    nodes: [
      { id: 'n1', type: 'trigger', label: '문의글 감지', module: 'cs', config: { event: 'new_inquiry' }, position: { x: 100, y: 200 }, status: 'running' },
      { id: 'n2', type: 'ai_process', label: 'AI 분류/답변 생성', module: 'cs', config: { model: 'gpt-4' }, position: { x: 350, y: 200 }, status: 'idle' },
      { id: 'n3', type: 'condition', label: '자동답변 가능?', module: 'cs', config: {}, position: { x: 600, y: 200 }, status: 'idle' },
      { id: 'n4', type: 'action', label: '자동 답변 등록', module: 'cs', config: {}, position: { x: 850, y: 100 }, status: 'idle' },
      { id: 'n5', type: 'notification', label: '담당자 알림', module: 'cs', config: {}, position: { x: 850, y: 300 }, status: 'idle' },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4', label: '정형문의' },
      { id: 'e4', source: 'n3', target: 'n5', label: '복잡문의' },
    ],
    isActive: true,
    lastRun: new Date(Date.now() - 180000).toISOString(),
    lastStatus: 'running',
    createdAt: '2026-03-10T09:00:00Z',
    updatedAt: '2026-03-18T09:00:00Z',
  },
  {
    id: 'wf-bank-reconcile',
    name: '은행입출금 자동장부',
    description: '오픈뱅킹 API로 입출금 내역 자동 수집 → 엑셀 장부 기재',
    module: 'accounting',
    nodes: [
      { id: 'n1', type: 'trigger', label: '17:00 스케줄', module: 'accounting', config: { cron: '0 17 * * 1-5' }, position: { x: 100, y: 200 }, status: 'success' },
      { id: 'n2', type: 'api_call', label: '은행 입출금 조회', module: 'accounting', config: { api: 'openbank' }, position: { x: 350, y: 200 }, status: 'success' },
      { id: 'n3', type: 'data_transform', label: '장부 형식 변환', module: 'accounting', config: {}, position: { x: 600, y: 200 }, status: 'success' },
      { id: 'n4', type: 'action', label: '엑셀 자동기재', module: 'accounting', config: {}, position: { x: 850, y: 200 }, status: 'idle' },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
    isActive: true,
    schedule: '0 17 * * 1-5',
    lastRun: new Date(Date.now() - 3600000).toISOString(),
    lastStatus: 'success',
    createdAt: '2026-03-05T09:00:00Z',
    updatedAt: '2026-03-18T09:00:00Z',
  },
];

const mockLogs: ExecutionLog[] = [
  { id: 'log1', workflowId: 'wf-order-collect', workflowName: '주문 자동수집', module: 'order', status: 'success', startedAt: new Date(Date.now() - 300000).toISOString(), completedAt: new Date(Date.now() - 290000).toISOString(), duration: 10000, message: '42건 주문 수집 완료' },
  { id: 'log2', workflowId: 'wf-tracking-sync', workflowName: '운송장 자동전송', module: 'order', status: 'success', startedAt: new Date(Date.now() - 600000).toISOString(), completedAt: new Date(Date.now() - 595000).toISOString(), duration: 5000, message: '38건 운송장 전송 완료' },
  { id: 'log3', workflowId: 'wf-inventory-sync', workflowName: '재고 실시간 동기화', module: 'inventory', status: 'success', startedAt: new Date(Date.now() - 120000).toISOString(), completedAt: new Date(Date.now() - 115000).toISOString(), duration: 5000, message: '재고 동기화 완료 (불일치: 3건)' },
  { id: 'log4', workflowId: 'wf-cs-auto-reply', workflowName: 'CS 자동답변', module: 'cs', status: 'running', startedAt: new Date(Date.now() - 180000).toISOString(), message: '네이버 문의 2건 처리중...' },
  { id: 'log5', workflowId: 'wf-tax-invoice', workflowName: '세금계산서 자동발행', module: 'accounting', status: 'success', startedAt: new Date(Date.now() - 1800000).toISOString(), completedAt: new Date(Date.now() - 1795000).toISOString(), duration: 5000, message: '3건 세금계산서 발행 완료' },
  { id: 'log6', workflowId: 'wf-daily-report', workflowName: '일매출 자동보고서', module: 'report', status: 'success', startedAt: new Date(Date.now() - 7200000).toISOString(), completedAt: new Date(Date.now() - 7185000).toISOString(), duration: 15000, message: '3/17 일매출 보고서 생성 완료' },
  { id: 'log7', workflowId: 'wf-order-collect', workflowName: '주문 자동수집', module: 'order', status: 'error', startedAt: new Date(Date.now() - 7800000).toISOString(), completedAt: new Date(Date.now() - 7795000).toISOString(), duration: 5000, message: '쿠팡 API 타임아웃 - 재시도 성공' },
  { id: 'log8', workflowId: 'wf-bank-reconcile', workflowName: '은행입출금 자동장부', module: 'accounting', status: 'success', startedAt: new Date(Date.now() - 3600000).toISOString(), completedAt: new Date(Date.now() - 3590000).toISOString(), duration: 10000, message: '입출금 24건 자동기재 완료' },
];

const mockConnections: ApiConnection[] = [
  { id: 'conn-selpia', provider: 'selpia', name: '셀피아', isConnected: true, lastChecked: new Date().toISOString() },
  { id: 'conn-sabangnet', provider: 'sabangnet', name: '사방넷', isConnected: true, lastChecked: new Date().toISOString() },
  { id: 'conn-symphony', provider: 'symphony', name: '거영심포니', isConnected: true, lastChecked: new Date().toISOString() },
  { id: 'conn-makeshop', provider: 'makeshop', name: '메이크샵', isConnected: true, lastChecked: new Date().toISOString() },
  { id: 'conn-hometax', provider: 'hometax', name: '국세청 홈택스', isConnected: true, lastChecked: new Date().toISOString() },
  { id: 'conn-coupang', provider: 'coupang', name: '쿠팡', isConnected: true, lastChecked: new Date().toISOString() },
  { id: 'conn-naver', provider: 'naver', name: '네이버 스마트스토어', isConnected: true, lastChecked: new Date().toISOString() },
  { id: 'conn-gmarket', provider: 'gmarket', name: '지마켓', isConnected: false },
  { id: 'conn-openbank', provider: 'openbank', name: '오픈뱅킹', isConnected: false },
  { id: 'conn-aligo', provider: 'aligo', name: '알리고 (문자)', isConnected: false },
  { id: 'conn-openai', provider: 'openai', name: 'OpenAI', isConnected: true, lastChecked: new Date().toISOString() },
];

// ============================================
// Store Interface
// ============================================
interface AppStore {
  // State
  modules: ModuleStatus[];
  workflows: Workflow[];
  executionLogs: ExecutionLog[];
  connections: ApiConnection[];
  selectedModule: ModuleCategory | null;
  sidebarOpen: boolean;

  // Computed
  getDashboardStats: () => DashboardStats;
  getWorkflowsByModule: (module: ModuleCategory) => Workflow[];
  getLogsByModule: (module: ModuleCategory) => ExecutionLog[];

  // Actions
  setSelectedModule: (module: ModuleCategory | null) => void;
  toggleSidebar: () => void;
  toggleWorkflow: (workflowId: string) => void;
  toggleModule: (moduleId: ModuleCategory) => void;
  addExecutionLog: (log: ExecutionLog) => void;
  updateConnection: (id: string, updates: Partial<ApiConnection>) => void;
}

export const useStore = create<AppStore>((set, get) => ({
  modules: mockModules,
  workflows: mockWorkflows,
  executionLogs: mockLogs,
  connections: mockConnections,
  selectedModule: null,
  sidebarOpen: true,

  getDashboardStats: () => {
    const { modules, workflows, executionLogs } = get();
    return {
      totalWorkflows: workflows.length,
      activeWorkflows: workflows.filter((w) => w.isActive).length,
      todayExecutions: modules.reduce((sum, m) => sum + m.todayExecutions, 0),
      todayErrors: modules.reduce((sum, m) => sum + m.todayErrors, 0),
      totalSavedMinutes: modules.reduce((sum, m) => sum + m.savedMinutes, 0),
      modules,
    };
  },

  getWorkflowsByModule: (module) => {
    return get().workflows.filter((w) => w.module === module);
  },

  getLogsByModule: (module) => {
    return get().executionLogs.filter((l) => l.module === module);
  },

  setSelectedModule: (module) => set({ selectedModule: module }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toggleWorkflow: (workflowId) =>
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === workflowId ? { ...w, isActive: !w.isActive } : w
      ),
    })),

  toggleModule: (moduleId) =>
    set((s) => ({
      modules: s.modules.map((m) =>
        m.id === moduleId ? { ...m, isActive: !m.isActive } : m
      ),
    })),

  addExecutionLog: (log) =>
    set((s) => ({ executionLogs: [log, ...s.executionLogs].slice(0, 100) })),

  updateConnection: (id, updates) =>
    set((s) => ({
      connections: s.connections.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
}));
