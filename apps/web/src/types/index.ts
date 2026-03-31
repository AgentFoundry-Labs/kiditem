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
export interface ApiConnection {
  id: string;
  provider: string;
  name: string;
  isConnected: boolean;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  baseUrl?: string;
  lastChecked?: string;
  config?: Record<string, any>;
}

