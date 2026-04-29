// ============================================
// KidItem Workflow AutoSystem - Core Types
// ============================================

// --- Workflow Engine Types ---
//
// Mirrors the slim server-side executor surface in
// `apps/server/src/workflows/executors/builtin.ts`. The workflow engine is a
// DAG runner + run/panel recorder + Agent delegation shell. AI/LLM work goes
// through `agent_task.create` only — there is no generic `ai_process`,
// `api_call`, `data_transform`, etc. anymore.
export type NodeType =
  | 'trigger.manual'
  | 'trigger.schedule'
  | 'condition.evaluate'
  | 'notification.alert'
  | 'agent_task.create';

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
