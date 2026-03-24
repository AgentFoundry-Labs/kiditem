// ============================================
// KidItem Workflow AutoSystem - Core Types
// ============================================

// --- Workflow Engine Types ---
export type NodeType =
  | 'trigger'
  | 'action'
  | 'condition'
  | 'delay'
  | 'loop'
  | 'api_call'
  | 'data_transform'
  | 'notification'
  | 'ai_process';

export type TriggerType =
  | 'schedule'    // 스케줄 (cron)
  | 'webhook'     // 외부 웹훅
  | 'event'       // 내부 이벤트
  | 'manual';     // 수동 실행

export type ModuleCategory =
  | 'order'       // 주문관리
  | 'accounting'  // 회계/경리
  | 'inventory'   // 재고관리
  | 'cs'          // CS
  | 'report'      // 보고서
  | 'product'     // 상품관리
  | 'marketing';  // 마케팅

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  module: ModuleCategory;
  config: Record<string, any>;
  position: { x: number; y: number };
  status: 'idle' | 'running' | 'success' | 'error' | 'disabled';
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  module: ModuleCategory;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isActive: boolean;
  schedule?: string; // cron expression
  lastRun?: string;
  lastStatus?: 'success' | 'error' | 'running';
  createdAt: string;
  updatedAt: string;
}

// --- Module Status Types ---
export interface ModuleStatus {
  id: ModuleCategory;
  name: string;
  nameKo: string;
  description: string;
  isActive: boolean;
  activeWorkflows: number;
  totalWorkflows: number;
  lastRun?: string;
  todayExecutions: number;
  todayErrors: number;
  savedMinutes: number; // 오늘 절감된 시간(분)
}

// --- Dashboard Types ---
export interface DashboardStats {
  totalWorkflows: number;
  activeWorkflows: number;
  todayExecutions: number;
  todayErrors: number;
  totalSavedMinutes: number;
  modules: ModuleStatus[];
}

export interface ExecutionLog {
  id: string;
  workflowId: string;
  workflowName: string;
  module: ModuleCategory;
  status: 'success' | 'error' | 'running';
  startedAt: string;
  completedAt?: string;
  duration?: number; // ms
  message?: string;
  details?: Record<string, any>;
}

// --- API Integration Types ---
export type ApiProvider =
  | 'selpia'      // 셀피아
  | 'sabangnet'   // 사방넷
  | 'symphony'    // 거영심포니
  | 'makeshop'    // 메이크샵
  | 'hometax'     // 국세청 홈택스
  | 'coupang'     // 쿠팡
  | 'naver'       // 네이버 스마트스토어
  | 'gmarket'     // 지마켓
  | 'auction'     // 옥션
  | '11st'        // 11번가
  | 'openbank'    // 오픈뱅킹
  | 'aligo'       // 알리고 (문자)
  | 'openai';     // OpenAI

export interface ApiConnection {
  id: string;
  provider: ApiProvider;
  name: string;
  isConnected: boolean;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  baseUrl?: string;
  lastChecked?: string;
  config?: Record<string, any>;
}

// --- Order Types ---
export interface Order {
  id: string;
  platform: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  quantity: number;
  amount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
  trackingNumber?: string;
  orderedAt: string;
  shippedAt?: string;
}

// --- Inventory Types ---
export interface InventoryItem {
  id: string;
  sku: string;
  productName: string;
  selpiaStock: number;
  symphonyStock: number;
  sabangnetStock: number;
  actualStock?: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  lastSynced?: string;
}

// --- Report Types ---
export interface DailySalesReport {
  date: string;
  totalSales: number;
  orderCount: number;
  byPlatform: Record<string, { sales: number; orders: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
}

// --- Staff / Task Types ---
export interface StaffMember {
  id: string;
  name: string;
  role: string;
  tasks: TaskCategory[];
}

export interface TaskCategory {
  id: string;
  name: string;
  module: ModuleCategory;
  automationLevel: number; // 0-100
  dailyMinutes: number;
  automatedMinutes: number;
}
