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

type ModuleCategory =
  | 'order'       // 주문관리
  | 'accounting'  // 회계/경리
  | 'inventory'   // 재고관리
  | 'cs'          // CS
  | 'report'      // 보고서
  | 'product'     // 상품관리
  | 'marketing';  // 마케팅

interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  module: ModuleCategory;
  config: Record<string, any>;
  position: { x: number; y: number };
  status: 'idle' | 'running' | 'success' | 'error' | 'disabled';
}

interface WorkflowEdge {
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

